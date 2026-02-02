/**
 * Scheduler Initialization
 * 
 * Initializes and starts the scheduler service when the application starts
 */

import { schedulerService } from './scheduler-service';

let isInitialized = false;

export async function initializeScheduler() {
  if (isInitialized) {
    console.log('[Scheduler] Already initialized');
    return;
  }

  try {
    console.log('[Scheduler] Initializing...');
    await schedulerService.start();
    isInitialized = true;
    console.log('[Scheduler] Initialized successfully');
  } catch (error) {
    console.error('[Scheduler] Failed to initialize:', error);
    throw error;
  }
}

export async function shutdownScheduler() {
  if (!isInitialized) {
    return;
  }

  try {
    console.log('[Scheduler] Shutting down...');
    await schedulerService.stop();
    isInitialized = false;
    console.log('[Scheduler] Shut down successfully');
  } catch (error) {
    console.error('[Scheduler] Error during shutdown:', error);
  }
}

export { schedulerService };
export * from './scheduler-service';
