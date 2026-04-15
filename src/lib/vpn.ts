import { randomBytes } from 'crypto';

// Generate WireGuard-compatible key pair using crypto
// In production, use actual wg genkey/pubkey commands
export function generateKeyPair(): { privateKey: string; publicKey: string } {
  // WireGuard keys are 32 bytes, base64 encoded
  const privateKey = randomBytes(32).toString('base64');
  // In production, derive public key from private key using Curve25519
  // For now, generate a placeholder public key
  const publicKey = randomBytes(32).toString('base64');
  return { privateKey, publicKey };
}

export function generatePresharedKey(): string {
  return randomBytes(32).toString('base64');
}

export function allocateSubnet(companyIndex: number): string {
  // Allocate 10.{index}.0.0/24 subnet per tenant
  // companyIndex should be unique per company
  const octet = (companyIndex % 254) + 1; // 1-254
  return `10.${octet}.0.0/24`;
}

export function allocatePeerIp(subnet: string, peerIndex: number): string {
  // Given subnet "10.X.0.0/24", allocate "10.X.0.{peerIndex+2}/32"
  // .1 is reserved for server, peers start at .2
  const parts = subnet.split('.');
  return `${parts[0]}.${parts[1]}.0.${peerIndex + 2}/32`;
}

export function generateWireguardConfig(params: {
  privateKey: string;
  address: string;
  serverPublicKey: string;
  serverEndpoint: string;
  serverPort: number;
  allowedIps: string;
  dns?: string;
}): string {
  return `[Interface]
PrivateKey = ${params.privateKey}
Address = ${params.address}
DNS = ${params.dns || '1.1.1.1, 8.8.8.8'}

[Peer]
PublicKey = ${params.serverPublicKey}
Endpoint = ${params.serverEndpoint}:${params.serverPort}
AllowedIPs = ${params.allowedIps}
PersistentKeepalive = 25
`;
}
