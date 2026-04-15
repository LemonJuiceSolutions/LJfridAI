import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { generateKeyPair, allocateSubnet } from '@/lib/vpn';

/**
 * GET /api/vpn/config - Returns VPN config for the user's company
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
      select: {
        id: true,
        serverPublicKey: true,
        subnet: true,
        port: true,
        enabled: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!vpnConfig) {
      return NextResponse.json({ vpnConfig: null });
    }

    return NextResponse.json({ vpnConfig });
  } catch (error: any) {
    console.error('[vpn/config] GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/vpn/config - Creates VPN config for company (admin only)
 * Generates server keypair and allocates subnet.
 */
export async function POST() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { companyId, role } = session.user as any;

    if (role !== 'admin' && role !== 'superadmin') {
      return NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 });
    }

    // Check if config already exists
    const existing = await db.vpnConfig.findUnique({
      where: { companyId },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'VPN config already exists for this company' },
        { status: 409 }
      );
    }

    // Determine company index for subnet allocation
    const companyCount = await db.vpnConfig.count();
    const subnet = allocateSubnet(companyCount);

    // Generate server keypair (private key stored securely, only public key in DB)
    const { publicKey } = generateKeyPair();

    const vpnConfig = await db.vpnConfig.create({
      data: {
        companyId,
        serverPublicKey: publicKey,
        subnet,
        port: parseInt(process.env.WG_SERVER_PORT || '51820', 10),
      },
      select: {
        id: true,
        serverPublicKey: true,
        subnet: true,
        port: true,
        enabled: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ vpnConfig }, { status: 201 });
  } catch (error: any) {
    console.error('[vpn/config] POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
