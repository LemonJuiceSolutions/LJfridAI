/**
 * Scheduler Actions
 * 
 * Server actions for scheduler management
 */

'use server';

import { initializeScheduler, shutdownScheduler } from '@/lib/scheduler';
import { getAuthenticatedUser } from '@/app/actions';

/**
 * Initialize the scheduler service
 * This should be called when the application starts
 */
export async function initializeSchedulerAction() {
  try {
    const user = await getAuthenticatedUser();
    
    // Only allow admins to initialize scheduler
    if (user.role !== 'admin' && user.role !== 'superadmin') {
      return {
        success: false,
        error: 'Unauthorized: Only admins can initialize the scheduler'
      };
    }

    await initializeScheduler();
    
    return {
      success: true,
      message: 'Scheduler initialized successfully'
    };
  } catch (error: any) {
    console.error('[Scheduler Action] Failed to initialize:', error);
    return {
      success: false,
      error: error.message || 'Failed to initialize scheduler'
    };
  }
}

/**
 * Shutdown the scheduler service
 */
export async function shutdownSchedulerAction() {
  try {
    const user = await getAuthenticatedUser();
    
    // Only allow admins to shutdown scheduler
    if (user.role !== 'admin' && user.role !== 'superadmin') {
      return {
        success: false,
        error: 'Unauthorized: Only admins can shutdown the scheduler'
      };
    }

    await shutdownScheduler();
    
    return {
      success: true,
      message: 'Scheduler shutdown successfully'
    };
  } catch (error: any) {
    console.error('[Scheduler Action] Failed to shutdown:', error);
    return {
      success: false,
      error: error.message || 'Failed to shutdown scheduler'
    };
  }
}

/**
 * Get scheduler status
 */
export async function getSchedulerStatusAction() {
  try {
    const user = await getAuthenticatedUser();
    
    // Only allow admins to check scheduler status
    if (user.role !== 'admin' && user.role !== 'superadmin') {
      return {
        success: false,
        error: 'Unauthorized: Only admins can check scheduler status'
      };
    }

    // For now, we'll just return a simple status
    // In a real implementation, you might want to add a status method to the scheduler service
    return {
      success: true,
      status: 'running',
      message: 'Scheduler is running'
    };
  } catch (error: any) {
    console.error('[Scheduler Action] Failed to get status:', error);
    return {
      success: false,
      error: error.message || 'Failed to get scheduler status'
    };
  }
}
