import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

/**
 * DELETE /api/vpn/peers/[id] - Remove a peer
 * Users can delete their own peers; admins can delete any peer in their company.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { companyId, id: userId, role } = session.user as any;
    const { id: peerId } = await params;

    // Find the peer and verify it belongs to the user's company
    const peer = await db.vpnPeer.findUnique({
      where: { id: peerId },
      include: {
        vpnConfig: {
          select: { companyId: true },
        },
      },
    });

    if (!peer) {
      return NextResponse.json({ error: 'Peer not found' }, { status: 404 });
    }

    // Tenant isolation: peer must belong to user's company
    if (peer.vpnConfig.companyId !== companyId) {
      return NextResponse.json({ error: 'Peer not found' }, { status: 404 });
    }

    // Authorization: only own peers or admin
    if (peer.userId !== userId && role !== 'admin' && role !== 'superadmin') {
      return NextResponse.json(
        { error: 'Forbidden: you can only delete your own peers' },
        { status: 403 }
      );
    }

    await db.vpnPeer.delete({
      where: { id: peerId },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[vpn/peers/[id]] DELETE error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
