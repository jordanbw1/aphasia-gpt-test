import * as logger from "firebase-functions/logger";
import {defineString} from "firebase-functions/params";
import * as math from "mathjs";

import {
  PromptCandidate,
  PromptTestResults,
  TestCase,
  TestResultsStatus,
} from "../../shared/types";
import {TestResultsDatabaseService} from "./data/TestResultsDatabaseService";
import {retryOnFailure} from "./httpUtils";
import {HuggingFaceService} from "./services/HuggingFaceService";
import {OpenAIService} from "./services/OpenAIService";

const HUGGINGFACE_API_TOKEN = defineString("HUGGINGFACE_API_TOKEN");
const OPENAI_API_KEY = defineString("OPENAI_API_KEY");

const OPENAI_MAX_RETRY = 4;
const OPENAI_WAIT_TIME_SECONDS = 5;
const HUGGINGFACE_MAX_RETRY = 4;
const HUGGINGFACE_WAIT_TIME_SECONDS = 5;

/**
 * Process a test case against a prompt.
 * The test case is run against the prompt, and the results are saved.
 * @param prompt The prompt to test.
 * @param testCase The test case to run.
 * @param promptTestResults The prompt test results.
 */
export async function processTestCase(
  prompt: PromptCandidate,
  testCase: TestCase,
  promptTestResults: PromptTestResults,
  testResultsService: TestResultsDatabaseService
) {
  if (!testCase.id) {
    throw new Error("Test case id is missing");
  }
  if (!promptTestResults.id) {
    throw new Error("Prompt test results id is missing");
  }

  let llmCompletions: string[] = [];
  let cosineSimilarityScore = -Infinity;

  await testResultsService.updateTestCaseResultStatus(
    promptTestResults.id,
    testCase.id,
    TestResultsStatus.IN_PROGRESS
  );

  logger.debug(`Running test case ${testCase.id} against prompt ${prompt.id}`);

  try {
    const result = await runPromptTestCase(
      prompt,
      testCase,
      promptTestResults.llmModel,
      promptTestResults.embeddingsModel,
      promptTestResults.temperature,
      promptTestResults.maxTokens
    );
    llmCompletions = result.llmCompletions;
    cosineSimilarityScore = result.cosineSimilarityScore;

    if (cosineSimilarityScore > 1 || cosineSimilarityScore < -1) {
      throw new Error(
        `Cosine similarity score is out of range
            [-1, 1]: ${cosineSimilarityScore}`
      );
    }

    logger.info(
      `Test case ${testCase.id} completed with cosine similarity
          score: ${cosineSimilarityScore}`
    );
    logger.info(
      `Saving test case ${testCase.id} result with cosine similarity
          score: ${cosineSimilarityScore}`
    );
    await testResultsService.saveTestCaseResult(
      promptTestResults.id,
      testCase.id,
      cosineSimilarityScore,
      llmCompletions
    );
  } catch (error) {
    logger.error(`Error running test case ${testCase.id}: ${error}`);
    await testResultsService.updateTestCaseResultStatus(
      promptTestResults.id,
      testCase.id,
      TestResultsStatus.ERROR,
      error instanceof Error ? error.toString() : "unknown error"
    );
  }
}

/**
 * Run a test case against a prompt, getting completions from the LLM and
 * calculating the cosine similarity of the embeddings of the completions
 * and the good completions.
 * @param prompt The prompt to test.
 * @param testCase The test case to run.
 * @param openaiModel The OpenAI model to use.
 * @param embeddingsModelName The Hugging Face model to use for embeddings.
 * @param temperature The temperature to use for the LLM.
 * @param maxTokens The maximum number of tokens to generate.
 * @return The completions from the LLM and the cosine similarity score.
 */
async function runPromptTestCase(
  prompt: PromptCandidate,
  testCase: TestCase,
  openaiModel: string,
  embeddingsModelName: string,
  temperature: number,
  maxTokens: number
): Promise<{llmCompletions: string[]; cosineSimilarityScore: number}> {
  logger.info(`Running test case ${testCase.id} against prompt ${prompt.id}`);

  const openAIService = new OpenAIService(OPENAI_API_KEY.value());
  const huggingFaceService = new HuggingFaceService(
    HUGGINGFACE_API_TOKEN.value()
  );

  const formattedPrompt = replaceMultiple(prompt.prompt, {
    "{name}": testCase.bio.name,
    "{age}": testCase.bio.age.toString(),
    "{about_me}": testCase.bio.aboutMe,
    "{conversation_type}": testCase.context.conversationType,
    "{setting}": testCase.context.setting,
    "{tone}": testCase.context.tone,
    "{utterance}": testCase.utterance,
  });

  const gptCompletions = await retryOnFailure(
    async () =>
      await openAIService.getGptCompletion(
        formattedPrompt,
        openaiModel,
        temperature,
        maxTokens
      ),
    OPENAI_MAX_RETRY,
    OPENAI_WAIT_TIME_SECONDS
  );

  const gptEmbeddings = await retryOnFailure(
    async () =>
      await huggingFaceService.embedTexts(gptCompletions, embeddingsModelName),
    HUGGINGFACE_MAX_RETRY,
    HUGGINGFACE_WAIT_TIME_SECONDS
  );
  const goodEmbeddings = await retryOnFailure(
    async () =>
      await huggingFaceService.embedTexts(
        testCase.goodCompletions,
        embeddingsModelName
      ),
    HUGGINGFACE_MAX_RETRY,
    HUGGINGFACE_WAIT_TIME_SECONDS
  );

  const avgGptEmbedding: number[] = averageOfVectors(gptEmbeddings);
  const avgGoodEmbedding = averageOfVectors(goodEmbeddings);

  return {
    llmCompletions: gptCompletions,
    cosineSimilarityScore: cosineSimilarity(avgGptEmbedding, avgGoodEmbedding),
  };
}

/**
 * Replace multiple substrings in a string.
 * @param original The original string.
 * @param replacements The replacements to make.
 * @return The string with the replacements made.
 */
function replaceMultiple(
  original: string,
  replacements: {[key: string]: string}
): string {
  let result = original;
  for (const key in replacements) {
    if (Object.prototype.hasOwnProperty.call(replacements, key)) {
      result = result.split(key).join(replacements[key]);
    }
  }
  return result;
}

/**
 * Calculate the cosine similarity score of two vectors. Output is in the range [-1, 1].
 * @param A First vector
 * @param B Second vector
 * @return The cosine similarity score of the two vectors.
 */
function cosineSimilarity(A: number[], B: number[]): number {
  const dotProduct = math.dot(A, B);
  const magnitudeA = math.norm(A);
  const magnitudeB = math.norm(B);

  return Number(math.divide(dotProduct, math.multiply(magnitudeA, magnitudeB)));
}

/**
 * Calculate the column-wise average of a list of vectors.
 * @param vectors The list of vectors.
 * @return A vector that is the average of the input vectors.
 */
function averageOfVectors(vectors: number[][]): number[] {
  return vectors
    .reduce((acc, vector) => {
      return acc.map((val, i) => val + vector[i]);
    }, Array(vectors[0].length).fill(0))
    .map((val) => val / vectors.length);
}
