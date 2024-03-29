import {onRequest} from "firebase-functions/v2/https";

import {PRODUCTION_APP_URL} from "./constants";
import {readTestCases} from "./firebaseUtils";

/**
 * Get all test cases from the Realtime DB.
 */
export const getAllTestCasesHandler = onRequest(
  {cors: PRODUCTION_APP_URL},
  async (req, res) => {
    const testCases = await readTestCases();
    res.send(testCases);
  }
);
