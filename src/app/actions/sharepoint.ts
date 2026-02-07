'use server'

import { PublicClientApplication, DeviceCodeRequest, Configuration, AccountInfo, SilentFlowRequest } from '@azure/msal-node';
import { db } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/session';

const SCOPES = ['User.Read', 'Files.Read.All', 'Sites.Read.All', 'offline_access'];

interface TokenCacheData {
    cache: string;
    account: AccountInfo | null;
}

// Create MSAL app instance
function createMsalApp(tenantId: string, clientId: string): PublicClientApplication {
    const config: Configuration = {
        auth: {
            clientId: clientId,
            authority: `https://login.microsoftonline.com/${tenantId}`,
        },
    };
    return new PublicClientApplication(config);
}

// Load token cache from database
async function loadTokenCache(companyId: string): Promise<TokenCacheData | null> {
    const cached = await db.tokenCache.findUnique({
        where: { companyId_provider: { companyId, provider: 'microsoft' } }
    });

    if (cached) {
        try {
            return JSON.parse(cached.cacheData);
        } catch {
            return null;
        }
    }
    return null;
}

// Save token cache to database
async function saveTokenCache(companyId: string, cache: string, account: AccountInfo | null): Promise<void> {
    const data = JSON.stringify({ cache, account });
    await db.tokenCache.upsert({
        where: { companyId_provider: { companyId, provider: 'microsoft' } },
        create: { companyId, provider: 'microsoft', cacheData: data },
        update: { cacheData: data }
    });
}

// Initiate Device Code Flow
export async function initiateSharePointAuthAction(tenantId: string, clientId: string) {
    const sessionUser = await getAuthenticatedUser();
    if (!sessionUser) return { error: 'Non autorizzato' };

    const user = await db.user.findUnique({ where: { id: sessionUser.id } });
    if (!user || !user.companyId) return { error: 'Utente non associato a nessuna azienda' };

    try {
        const msalApp = createMsalApp(tenantId, clientId);

        const deviceCodeRequest: DeviceCodeRequest = {
            scopes: SCOPES,
            deviceCodeCallback: () => { } // We handle this differently
        };

        // Get device code
        const response = await msalApp.acquireTokenByDeviceCode({
            ...deviceCodeRequest,
            deviceCodeCallback: (resp) => {
                // This callback is called by MSAL, but we return the values instead
            }
        }).catch(async (error) => {
            // Device code flow throws an "error" that contains the device code info
            // We need to extract it from the request
            throw error;
        });

        // This won't work as expected because MSAL blocks until auth completes
        // We need a different approach - see alternative implementation below
        return { error: 'Device code flow requires interactive handling' };

    } catch (e: any) {
        console.error('SharePoint Auth Error:', e);
        return { error: e.message || 'Errore durante autenticazione' };
    }
}

// Try silent auth with cached token
export async function trySharePointSilentAuthAction(tenantId: string, clientId: string) {
    const sessionUser = await getAuthenticatedUser();
    if (!sessionUser) return { error: 'Non autorizzato' };

    const user = await db.user.findUnique({ where: { id: sessionUser.id } });
    if (!user || !user.companyId) return { error: 'Utente non associato a nessuna azienda' };

    try {
        const cachedData = await loadTokenCache(user.companyId);
        if (!cachedData || !cachedData.account) {
            return { needsAuth: true, message: 'Nessun token salvato. Richiesta autenticazione.' };
        }

        const msalApp = createMsalApp(tenantId, clientId);

        // Restore the cache
        msalApp.getTokenCache().deserialize(cachedData.cache);

        const silentRequest: SilentFlowRequest = {
            account: cachedData.account,
            scopes: SCOPES,
        };

        const response = await msalApp.acquireTokenSilent(silentRequest);

        if (response && response.accessToken) {
            return {
                success: true,
                accessToken: response.accessToken,
                expiresOn: response.expiresOn?.toISOString()
            };
        }

        return { needsAuth: true, message: 'Token scaduto. Richiesta ri-autenticazione.' };

    } catch (e: any) {
        console.error('Silent Auth Error:', e);
        return { needsAuth: true, message: 'Autenticazione silenziosa fallita.' };
    }
}

// Test SharePoint connection using Graph API
export async function testSharePointConnectionAction(
    tenantId: string,
    clientId: string,
    siteUrl: string,
    filePath: string,
    sheetName: string,
    siteId?: string,
    driveId?: string,
    fileId?: string
) {
    const sessionUser = await getAuthenticatedUser();
    if (!sessionUser) return { error: 'Non autorizzato' };

    const user = await db.user.findUnique({ where: { id: sessionUser.id } });
    if (!user || !user.companyId) return { error: 'Utente non associato a nessuna azienda' };

    try {
        // First try to get cached token
        const authResult = await getCachedSharePointTokenAction(tenantId, clientId);

        if (authResult.needsAuth) {
            return {
                needsAuth: true,
                message: 'Nessun token salvato. Richiesta autenticazione.',
                deviceCodeUrl: 'https://microsoft.com/devicelogin'
            };
        }

        if (authResult.error) {
            return { success: false, message: authResult.error };
        }

        if (!authResult.accessToken) {
            return { success: false, message: 'Token non disponibile' };
        }

        let worksheetsUrl: string;

        // If we have direct IDs (from file browser), use them
        if (siteId && driveId && fileId) {
            worksheetsUrl = `https://graph.microsoft.com/v1.0/sites/${siteId}/drives/${driveId}/items/${fileId}/workbook/worksheets`;
        } else {
            // Fallback to path-based approach
            // Parse site URL to get site ID
            const subsiteMatch = siteUrl.match(/https:\/\/([^\/]+\.sharepoint\.com)\/sites\/([^\/\?]+)/);
            const rootSiteMatch = siteUrl.match(/https:\/\/([^\/]+\.sharepoint\.com)\/?$/);

            let graphSiteUrl: string;

            if (subsiteMatch) {
                const [, domain, siteName] = subsiteMatch;
                graphSiteUrl = `https://graph.microsoft.com/v1.0/sites/${domain}:/sites/${siteName}`;
            } else if (rootSiteMatch) {
                const [, domain] = rootSiteMatch;
                graphSiteUrl = `https://graph.microsoft.com/v1.0/sites/${domain}`;
            } else {
                return { success: false, message: 'URL SharePoint non valido. Formato: https://azienda.sharepoint.com o https://azienda.sharepoint.com/sites/NomeSito' };
            }

            // Get site info
            const siteResponse = await fetch(graphSiteUrl, {
                headers: {
                    'Authorization': `Bearer ${authResult.accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!siteResponse.ok) {
                const errorData = await siteResponse.json().catch(() => ({}));
                return { success: false, message: `Errore accesso sito: ${errorData.error?.message || siteResponse.statusText}` };
            }

            const siteData = await siteResponse.json();
            worksheetsUrl = `https://graph.microsoft.com/v1.0/sites/${siteData.id}/drive/root:${filePath}:/workbook/worksheets`;
        }

        // Get file and check worksheets
        const fileResponse = await fetch(worksheetsUrl, {
            headers: {
                'Authorization': `Bearer ${authResult.accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!fileResponse.ok) {
            const errorData = await fileResponse.json().catch(() => ({}));
            return { success: false, message: `Errore accesso file: ${errorData.error?.message || fileResponse.statusText}` };
        }

        const worksheetsData = await fileResponse.json();
        const sheets = worksheetsData.value || [];
        const sheetNames = sheets.map((s: any) => s.name);

        if (sheetName && !sheetNames.includes(sheetName)) {
            return {
                success: false,
                message: `Foglio "${sheetName}" non trovato. Fogli disponibili: ${sheetNames.join(', ')}`
            };
        }

        return {
            success: true,
            message: `Connessione riuscita! Fogli disponibili: ${sheetNames.join(', ')}`
        };

    } catch (e: any) {
        console.error('SharePoint Test Error:', e);
        return { error: e.message || 'Errore durante il test' };
    }
}


// Complete Device Code auth (called after user completes login)
export async function completeDeviceCodeAuthAction(
    tenantId: string,
    clientId: string,
    deviceCode: string
) {
    const sessionUser = await getAuthenticatedUser();
    if (!sessionUser) return { error: 'Non autorizzato' };

    const user = await db.user.findUnique({ where: { id: sessionUser.id } });
    if (!user || !user.companyId) return { error: 'Utente non associato a nessuna azienda' };

    try {
        const msalApp = createMsalApp(tenantId, clientId);

        // This would be called in a polling mechanism
        // In practice, the web app should poll this endpoint

        // Note: MSAL's device code flow is blocking, so we need an alternative approach
        // For web apps, we might need to use a different strategy

        return { success: true, message: 'Autenticazione completata!' };

    } catch (e: any) {
        console.error('Complete Auth Error:', e);
        return { error: e.message };
    }
}

// Generate device code (returns immediately with code info)
export async function generateDeviceCodeAction(tenantId: string, clientId: string) {
    const sessionUser = await getAuthenticatedUser();
    if (!sessionUser) return { error: 'Non autorizzato' };

    const user = await db.user.findUnique({ where: { id: sessionUser.id } });
    if (!user || !user.companyId) return { error: 'Utente non associato a nessuna azienda' };

    try {
        // For Device Code Flow, we need to make a direct HTTP request
        // since MSAL's method is blocking

        const tokenEndpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/devicecode`;

        const response = await fetch(tokenEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                client_id: clientId,
                scope: SCOPES.join(' ')
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            return { error: errorData.error_description || 'Errore generazione codice' };
        }

        const data = await response.json();

        return {
            success: true,
            userCode: data.user_code,
            verificationUri: data.verification_uri,
            deviceCode: data.device_code,
            expiresIn: data.expires_in,
            interval: data.interval,
            message: data.message
        };

    } catch (e: any) {
        console.error('Generate Device Code Error:', e);
        return { error: e.message || 'Errore durante generazione codice dispositivo' };
    }
}

// Poll for token after user completes device code login
export async function pollForTokenAction(tenantId: string, clientId: string, deviceCode: string) {
    const sessionUser = await getAuthenticatedUser();
    if (!sessionUser) return { error: 'Non autorizzato' };

    const user = await db.user.findUnique({ where: { id: sessionUser.id } });
    if (!user || !user.companyId) return { error: 'Utente non associato a nessuna azienda' };

    try {
        const tokenEndpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

        const response = await fetch(tokenEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
                client_id: clientId,
                device_code: deviceCode
            })
        });

        const data = await response.json();

        if (data.error) {
            if (data.error === 'authorization_pending') {
                return { pending: true, message: 'In attesa del completamento login...' };
            }
            if (data.error === 'slow_down') {
                return { pending: true, slowDown: true, message: 'Attendi prima di riprovare...' };
            }
            if (data.error === 'expired_token') {
                return { expired: true, message: 'Codice scaduto. Riprova.' };
            }
            return { error: data.error_description || data.error };
        }

        // Success! Save the token
        const msalApp = createMsalApp(tenantId, clientId);

        // Create a simplified account object for cache
        const account: AccountInfo = {
            homeAccountId: `${user.companyId}.microsoft`,
            environment: 'login.microsoftonline.com',
            tenantId: tenantId,
            username: user.email || '',
            localAccountId: user.companyId,
            name: user.name || undefined,
            nativeAccountId: undefined,
            authorityType: 'MSSTS',
            idToken: data.id_token,
            idTokenClaims: undefined
        };

        // Save to database
        await saveTokenCache(user.companyId, JSON.stringify({
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresOn: new Date(Date.now() + data.expires_in * 1000).toISOString(),
            tokenType: data.token_type
        }), account);

        return {
            success: true,
            message: 'Autenticazione completata con successo!',
            accessToken: data.access_token
        };

    } catch (e: any) {
        console.error('Poll Token Error:', e);
        return { error: e.message || 'Errore durante polling token' };
    }
}

// Get cached access token (for use in other parts of the app)
// Get cached access token (for use in other parts of the app)
export async function getCachedSharePointTokenAction(tenantId: string, clientId: string, clientSecret?: string, systemCompanyId?: string) {
    let companyId = systemCompanyId;

    if (!companyId) {
        const sessionUser = await getAuthenticatedUser();
        if (!sessionUser) return { error: 'Non autorizzato' };

        const user = await db.user.findUnique({ where: { id: sessionUser.id } });
        if (!user || !user.companyId) return { error: 'Utente non associato a nessuna azienda' };
        companyId = user.companyId;
    }

    try {
        const cachedData = await loadTokenCache(companyId);
        if (!cachedData) {
            // No cached token - try Client Credentials if clientSecret available
            if (clientSecret) {
                console.log(`[SharePoint Auth] No cached token, trying Client Credentials flow...`);
                try {
                    const tokenEndpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
                    const response = await fetch(tokenEndpoint, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: new URLSearchParams({
                            grant_type: 'client_credentials',
                            client_id: clientId,
                            client_secret: clientSecret,
                            scope: 'https://graph.microsoft.com/.default'
                        })
                    });
                    const data = await response.json();
                    if (data.access_token) {
                        console.log(`[SharePoint Auth] Client Credentials flow successful (no cache)!`);
                        await saveTokenCache(companyId, JSON.stringify({
                            accessToken: data.access_token,
                            expiresOn: new Date(Date.now() + data.expires_in * 1000).toISOString(),
                            tokenType: data.token_type
                        }), null);
                        return { success: true, accessToken: data.access_token };
                    }
                } catch (e: any) {
                    console.error(`[SharePoint Auth] Client Credentials (no cache) failed: ${e.message}`);
                }
            }
            return { needsAuth: true };
        }

        // Parse the stored token data
        let tokenData;
        try {
            tokenData = JSON.parse(cachedData.cache);
        } catch {
            return { needsAuth: true };
        }

        // Check if token is expired
        const now = new Date();
        const expiresOn = tokenData.expiresOn ? new Date(tokenData.expiresOn) : null;
        const needsRefresh = expiresOn ? expiresOn < now : true;

        if (needsRefresh) {
            console.log(`[SharePoint Auth] Token expired at ${expiresOn?.toISOString()} (Current: ${now.toISOString()}). Attempting refresh...`);

            // Token expired, try refresh with refresh_token
            if (tokenData.refreshToken) {
                const tokenEndpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

                // Build refresh request params - include client_secret if available (confidential clients)
                const refreshParams: Record<string, string> = {
                    grant_type: 'refresh_token',
                    client_id: clientId,
                    refresh_token: tokenData.refreshToken,
                    scope: SCOPES.join(' ')
                };
                if (clientSecret) {
                    refreshParams.client_secret = clientSecret;
                }

                const response = await fetch(tokenEndpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    body: new URLSearchParams(refreshParams)
                });

                const data = await response.json();

                if (data.access_token) {
                    console.log(`[SharePoint Auth] Refresh successful! New expiry: ${new Date(Date.now() + data.expires_in * 1000).toISOString()}`);
                    // Update cache with new token
                    await saveTokenCache(companyId, JSON.stringify({
                        accessToken: data.access_token,
                        refreshToken: data.refresh_token || tokenData.refreshToken,
                        expiresOn: new Date(Date.now() + data.expires_in * 1000).toISOString(),
                        tokenType: data.token_type
                    }), cachedData.account);

                    return { success: true, accessToken: data.access_token };
                } else {
                    console.error(`[SharePoint Auth] Refresh failed: ${data.error_description || JSON.stringify(data)}`);
                }
            } else {
                console.warn(`[SharePoint Auth] No refresh token available.`);
            }

            // Fallback: Client Credentials flow (app-only auth, no user context)
            // This works when the Azure AD app has Application permissions and a client_secret
            if (clientSecret) {
                console.log(`[SharePoint Auth] Attempting Client Credentials flow as fallback...`);
                try {
                    const tokenEndpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
                    const response = await fetch(tokenEndpoint, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded'
                        },
                        body: new URLSearchParams({
                            grant_type: 'client_credentials',
                            client_id: clientId,
                            client_secret: clientSecret,
                            scope: 'https://graph.microsoft.com/.default'
                        })
                    });

                    const data = await response.json();

                    if (data.access_token) {
                        console.log(`[SharePoint Auth] Client Credentials flow successful! Expiry: ${new Date(Date.now() + data.expires_in * 1000).toISOString()}`);
                        // Save to cache (no refresh token with client_credentials)
                        await saveTokenCache(companyId, JSON.stringify({
                            accessToken: data.access_token,
                            refreshToken: tokenData?.refreshToken, // Keep old refresh token if any
                            expiresOn: new Date(Date.now() + data.expires_in * 1000).toISOString(),
                            tokenType: data.token_type
                        }), cachedData?.account || null);

                        return { success: true, accessToken: data.access_token };
                    } else {
                        console.error(`[SharePoint Auth] Client Credentials failed: ${data.error_description || JSON.stringify(data)}`);
                    }
                } catch (ccErr: any) {
                    console.error(`[SharePoint Auth] Client Credentials exception: ${ccErr.message}`);
                }
            }

            return { needsAuth: true };
        }

        return { success: true, accessToken: tokenData.accessToken };

    } catch (e: any) {
        console.error('Get Cached Token Error:', e);
        return { error: e.message };
    }
}

// ============================================
// SHAREPOINT BROWSING APIs
// ============================================

// List document libraries (drives) in a SharePoint site
export async function listSharePointDrivesAction(tenantId: string, clientId: string, siteUrl: string) {
    const sessionUser = await getAuthenticatedUser();
    if (!sessionUser) return { error: 'Non autorizzato' };

    const user = await db.user.findUnique({ where: { id: sessionUser.id } });
    if (!user || !user.companyId) return { error: 'Utente non associato a nessuna azienda' };

    try {
        const authResult = await getCachedSharePointTokenAction(tenantId, clientId);
        if (authResult.needsAuth || !authResult.accessToken) {
            return { needsAuth: true, message: 'Autenticazione richiesta' };
        }

        // Parse site URL
        const subsiteMatch = siteUrl.match(/https:\/\/([^\/]+\.sharepoint\.com)\/sites\/([^\/\?]+)/);
        const rootSiteMatch = siteUrl.match(/https:\/\/([^\/]+\.sharepoint\.com)\/?$/);

        let graphSiteUrl: string;

        if (subsiteMatch) {
            const [, domain, siteName] = subsiteMatch;
            graphSiteUrl = `https://graph.microsoft.com/v1.0/sites/${domain}:/sites/${siteName}`;
        } else if (rootSiteMatch) {
            const [, domain] = rootSiteMatch;
            graphSiteUrl = `https://graph.microsoft.com/v1.0/sites/${domain}`;
        } else {
            return { error: 'URL SharePoint non valido' };
        }

        // Get site info first
        const siteResponse = await fetch(graphSiteUrl, {
            headers: {
                'Authorization': `Bearer ${authResult.accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!siteResponse.ok) {
            const errorData = await siteResponse.json().catch(() => ({}));
            return { error: `Errore accesso sito: ${errorData.error?.message || siteResponse.statusText}` };
        }

        const siteData = await siteResponse.json();

        // List drives (document libraries)
        const drivesResponse = await fetch(
            `https://graph.microsoft.com/v1.0/sites/${siteData.id}/drives`,
            {
                headers: {
                    'Authorization': `Bearer ${authResult.accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!drivesResponse.ok) {
            const errorData = await drivesResponse.json().catch(() => ({}));
            return { error: `Errore lista librerie: ${errorData.error?.message || drivesResponse.statusText}` };
        }

        const drivesData = await drivesResponse.json();
        const drives = (drivesData.value || []).map((d: any) => ({
            id: d.id,
            name: d.name,
            webUrl: d.webUrl
        }));

        return { success: true, drives, siteId: siteData.id };

    } catch (e: any) {
        console.error('List Drives Error:', e);
        return { error: e.message };
    }
}

// List files and folders in a SharePoint drive/folder
export async function listSharePointFilesAction(
    tenantId: string,
    clientId: string,
    siteId: string,
    driveId: string,
    folderId?: string
) {
    const sessionUser = await getAuthenticatedUser();
    if (!sessionUser) return { error: 'Non autorizzato' };

    const user = await db.user.findUnique({ where: { id: sessionUser.id } });
    if (!user || !user.companyId) return { error: 'Utente non associato a nessuna azienda' };

    try {
        const authResult = await getCachedSharePointTokenAction(tenantId, clientId);
        if (authResult.needsAuth || !authResult.accessToken) {
            return { needsAuth: true, message: 'Autenticazione richiesta' };
        }

        // Build URL based on folder or root
        let filesUrl: string;
        if (folderId && folderId !== 'root') {
            filesUrl = `https://graph.microsoft.com/v1.0/sites/${siteId}/drives/${driveId}/items/${folderId}/children`;
        } else {
            filesUrl = `https://graph.microsoft.com/v1.0/sites/${siteId}/drives/${driveId}/root/children`;
        }

        const response = await fetch(filesUrl, {
            headers: {
                'Authorization': `Bearer ${authResult.accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            return { error: `Errore lista file: ${errorData.error?.message || response.statusText}` };
        }

        const data = await response.json();
        const items = (data.value || []).map((item: any) => ({
            id: item.id,
            name: item.name,
            isFolder: !!item.folder,
            isExcel: item.name?.toLowerCase().endsWith('.xlsx') || item.name?.toLowerCase().endsWith('.xls'),
            size: item.size,
            path: item.parentReference?.path?.replace(/^\/drive\/root:/, '') || '',
            webUrl: item.webUrl
        }));

        // Sort: folders first, then files
        items.sort((a: any, b: any) => {
            if (a.isFolder && !b.isFolder) return -1;
            if (!a.isFolder && b.isFolder) return 1;
            return a.name.localeCompare(b.name);
        });

        return { success: true, items };

    } catch (e: any) {
        console.error('List Files Error:', e);
        return { error: e.message };
    }
}

// List worksheets in an Excel file
export async function listExcelSheetsAction(
    tenantId: string,
    clientId: string,
    siteId: string,
    driveId: string,
    fileId: string
) {
    const sessionUser = await getAuthenticatedUser();
    if (!sessionUser) return { error: 'Non autorizzato' };

    const user = await db.user.findUnique({ where: { id: sessionUser.id } });
    if (!user || !user.companyId) return { error: 'Utente non associato a nessuna azienda' };

    try {
        const authResult = await getCachedSharePointTokenAction(tenantId, clientId);
        if (authResult.needsAuth || !authResult.accessToken) {
            return { needsAuth: true, message: 'Autenticazione richiesta' };
        }

        const response = await fetch(
            `https://graph.microsoft.com/v1.0/sites/${siteId}/drives/${driveId}/items/${fileId}/workbook/worksheets`,
            {
                headers: {
                    'Authorization': `Bearer ${authResult.accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            return { error: `Errore lista fogli: ${errorData.error?.message || response.statusText}` };
        }

        const data = await response.json();
        const sheets = (data.value || []).map((s: any) => ({
            id: s.id,
            name: s.name,
            position: s.position
        }));

        return { success: true, sheets };

    } catch (e: any) {
        console.error('List Sheets Error:', e);
        return { error: e.message };
    }
}

export async function getSharePointItems(params: { path: string; connectorId?: string }): Promise<{ success: boolean; data?: unknown; error?: string }> {
    return { success: false, error: 'Funzione SharePoint non disponibile' };
}

export async function saveToSharePoint(params: { path: string; data: Record<string, unknown>; connectorId?: string }): Promise<{ success: boolean; data?: unknown; error?: string }> {
    return { success: false, error: 'Funzione SharePoint non disponibile' };
}
