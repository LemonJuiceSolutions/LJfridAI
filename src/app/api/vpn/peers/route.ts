import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { generateKeyPair, allocatePeerIp, generateWireguardConfig } from '@/lib/vpn';

/**
 * GET /api/vpn/peers - List peers for the company's VPN
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { companyId } = session.user as any;

    const vpnConfig = await db.vpnConfig.findUnique({
      where: { companyId },
    });

    if (!vpnConfig) {
      return NextResponse.json(
        { error: 'No VPN configured for this company' },
        { status: 404 }
      );
    }

    const peers = await db.vpnPeer.findMany({
      where: { vpnConfigId: vpnConfig.id },
      select: {
        id: true,
        userId: true,
        publicKey: true,
        allowedIps: true,
        name: true,
        enabled: true,
        lastHandshake: true,
        createdAt: true,
        user: {
          select: { name: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ peers });
  } catch (error: any) {
    console.error('[vpn/peers] GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/vpn/peers - Add a new peer
 * Body: { name: string } (device name)
 * Returns downloadable .conf content.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { companyId, id: userId } = session.user as any;

    const vpnConfig = await db.vpnConfig.findUnique({
      where: { companyId },
    });

    if (!vpnConfig) {
      return NextResponse.json(
        { error: 'No VPN configured for this company' },
        { status: 404 }
      );
    }

    if (!vpnConfig.enabled) {
      return NextResponse.json(
        { error: 'VPN is currently disabled' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Device name is required' },
        { status: 400 }
      );
    }

    // Check for duplicate peer name for this user
    const existingPeer = await db.vpnPeer.findUnique({
      where: {
        vpnConfigId_userId_name: {
          vpnConfigId: vpnConfig.id,
          userId,
          name: name.trim(),
        },
      },
    });

    if (existingPeer) {
      return NextResponse.json(
        { error: 'A peer with this name already exists for your account' },
        { status: 409 }
      );
    }

    // Allocate IP: count existing peers to determine index
    const peerCount = await db.vpnPeer.count({
      where: { vpnConfigId: vpnConfig.id },
    });
    const allowedIps = allocatePeerIp(vpnConfig.subnet, peerCount);

    // Generate peer keypair
    const { privateKey, publicKey } = generateKeyPair();

    const peer = await db.vpnPeer.create({
      data: {
        vpnConfigId: vpnConfig.id,
        userId,
        publicKey,
        allowedIps,
        name: name.trim(),
      },
      select: {
        id: true,
        publicKey: true,
        allowedIps: true,
        name: true,
        createdAt: true,
      },
    });

    // Generate client .conf file content
    const serverEndpoint = process.env.WG_SERVER_ENDPOINT || 'vpn.example.com';
    const configContent = generateWireguardConfig({
      privateKey,
      address: allowedIps,
      serverPublicKey: vpnConfig.serverPublicKey,
      serverEndpoint,
      serverPort: vpnConfig.port,
      allowedIps: vpnConfig.subnet,
    });

    return NextResponse.json(
      {
        peer,
        configContent,
        warning: 'Save this configuration now. The private key will NOT be shown again.',
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('[vpn/peers] POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
