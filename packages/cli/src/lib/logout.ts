import { clearAllData } from '../auth/storage.js';
import {
  printStart,
  printSuccess,
  printFailure,
  msg,
} from '../utils/messages.js';

const context = msg('logout');

export default async function logout(): Promise<void> {
  printStart(context);
  try {
    // Clear all authentication data
    await clearAllData();

    printSuccess(context);
  } catch (error) {
    if (error instanceof Error) {
      printFailure(context, error.message);
    } else {
      printFailure(context);
    }
    process.exit(1);
  }
}
