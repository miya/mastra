import type { CoreMessage } from 'ai';
import type { Agent, AiMessageType, UIMessageWithMetadata } from '../../agent';
import { MastraError } from '../../error';
import type { RuntimeContext } from '../../runtime-context';
import { Workflow } from '../../workflows';
import type { MastraScorer } from '../base';
import { ScoreAccumulator } from './scorerAccumulator';

type RunExperimentDataItem = {
  input: string | string[] | CoreMessage[] | AiMessageType[] | UIMessageWithMetadata[] | any;
  groundTruth: any;
  runtimeContext?: RuntimeContext;
};

type RunExperimentResult<TScorerName extends string = string> = {
  scores: Record<TScorerName, number>;
  summary: {
    totalItems: number;
  };
};

// Extract the return type of a scorer's run method
type ScorerRunResult<T extends MastraScorer<any, any, any, any>> =
  T extends MastraScorer<any> ? Awaited<ReturnType<T['run']>> : never;

// Create a mapped type for scorer results
type ScorerResults<TScorers extends readonly MastraScorer<any, any, any, any>[]> = {
  [K in TScorers[number]['name']]: ScorerRunResult<Extract<TScorers[number], { name: K }>>;
};

export type RunExperimentOnItemComplete<TScorers extends readonly MastraScorer<any, any, any, any>[]> = ({
  item,
  targetResult,
  scorerResults,
}: {
  item: RunExperimentDataItem;
  targetResult: any;
  scorerResults: ScorerResults<TScorers>;
}) => void;

type WorkflowRunExperimentConfig = {
  workflow: Workflow;
  stepScorers: {
    [stepId: string]: MastraScorer[];
  };
};

export const runExperiment = async <const TScorer extends readonly MastraScorer[]>({
  data,
  scorers,
  target,
  workflowConfig,
  onItemComplete,
  concurrency = 1,
}: {
  data: RunExperimentDataItem[];
  scorers: TScorer;
  target: Agent | Workflow;
  workflowConfig?: WorkflowRunExperimentConfig;
  concurrency?: number;
  onItemComplete?: RunExperimentOnItemComplete<TScorer>;
}): Promise<RunExperimentResult<TScorer[number]['name']>> => {
  validateExperimentInputs(data, scorers, target, workflowConfig);

  let totalItems = 0;
  const scoreAccumulator = new ScoreAccumulator();

  const pMap = (await import('p-map')).default;
  await pMap(
    data,
    async item => {
      const targetResult = await executeTarget(target, item, workflowConfig);
      const scorerResults = await runScorers(scorers, targetResult, item);
      scoreAccumulator.addScores(scorerResults);

      // Handle workflow step scores if applicable
      if (targetResult && 'scoringData' in targetResult && targetResult.scoringData?.stepScorerResults) {
        scoreAccumulator.addStepScores(targetResult.scoringData.stepScorerResults);
      }

      if (onItemComplete) {
        onItemComplete({ item, targetResult, scorerResults });
      }

      totalItems++;
    },
    { concurrency },
  );

  return {
    scores: scoreAccumulator.getAverageScores(),
    summary: {
      totalItems,
    },
  };
};

// Validation functions
const validateExperimentInputs = <const TScorer extends readonly MastraScorer[]>(
  data: RunExperimentDataItem[],
  scorers: TScorer,
  target: Agent | Workflow,
  workflowConfig?: WorkflowRunExperimentConfig
) => {
  if (data.length === 0) {
    throw new MastraError({
      domain: 'SCORER',
      id: 'RUN_EXPERIMENT_FAILED_NO_DATA_PROVIDED',
      category: 'USER',
      text: 'Failed to run experiment: Data array is empty',
    });
  }

  if (scorers.length === 0) {
    throw new MastraError({
      domain: 'SCORER',
      id: 'RUN_EXPERIMENT_FAILED_NO_SCORERS_PROVIDED',
      category: 'USER',
      text: 'Failed to run experiment: No scorers provided',
    });
  }

  if (!target) {
    throw new MastraError({
      domain: 'SCORER',
      id: 'RUN_EXPERIMENT_FAILED_NO_TARGET_PROVIDED',
      category: 'USER',
      text: 'Failed to run experiment: No target provided',
    });
  }

  if (target instanceof Workflow && !workflowConfig) {
    throw new MastraError({
      domain: 'SCORER',
      id: 'RUN_EXPERIMENT_FAILED_WORKFLOW_CONFIG_MISSING',
      category: 'USER',
      text: 'Failed to run experiment: Workflow config required when target is a workflow',
    });
  }
};

const executeTarget = async (
  target: Agent | Workflow,
  item: RunExperimentDataItem,
  workflowConfig?: WorkflowRunExperimentConfig
) => {
  try {
    if (target instanceof Workflow) {
      if (!workflowConfig) {
        throw new Error('Workflow config required when target is a workflow');
      }
      return await executeWorkflow(item, workflowConfig);
    } else {
      return await executeAgent(target, item);
    }
  } catch (error) {
    throw new MastraError(
      {
        domain: 'SCORER',
        id: 'RUN_EXPERIMENT_TARGET_FAILED_TO_GENERATE_RESULT',
        category: 'USER',
        text: 'Failed to run experiment: Error generating result from target',
        details: {
          item: JSON.stringify(item),
        },
      },
      error,
    );
  }
};

const executeWorkflow = async (
  item: RunExperimentDataItem,
  workflowConfig: WorkflowRunExperimentConfig
) => {
  const run = workflowConfig.workflow.createRun({ disableScorers: true });
  const workflowResult = await run.start({
    inputData: item.input,
    runtimeContext: item.runtimeContext
  });

  const stepScorerResults: Record<string, any> = {};

  for (const [stepId, stepScorers] of Object.entries(workflowConfig.stepScorers)) {
    const stepResult = workflowResult.steps[stepId];
    if (stepResult?.status === 'success' && stepResult.payload && stepResult.output) {
      stepScorerResults[stepId] = await runStepScorers(
        stepScorers,
        stepResult,
        item
      );
    }
  }

  return {
    scoringData: {
      input: item.input,
      output: workflowResult.status === 'success' ? workflowResult.result : undefined,
      stepResults: workflowResult.steps,
      stepScorerResults
    }
  };
};

const runStepScorers = async (
  stepScorers: MastraScorer[],
  stepResult: any,
  item: RunExperimentDataItem
) => {
  const results: Record<string, any> = {};

  for (const scorer of stepScorers) {
    try {
      const score = await scorer.run({
        input: stepResult.payload,
        output: stepResult.output,
        groundTruth: item.groundTruth,
        runtimeContext: item.runtimeContext,
      });

      results[scorer.name] = score;
    } catch (error) {
      console.error(`Error running scorer ${scorer.name} on step:`, error);
    }
  }

  return results;
};

const executeAgent = async (
  agent: Agent,
  item: RunExperimentDataItem
) => {
  const model = await agent.getModel();

  if (model.specificationVersion === 'v2') {
    return await agent.generateVNext(item.input, {
      scorers: {},
      returnScorerData: true,
      runtimeContext: item.runtimeContext,
    });
  } else {
    return await agent.generate(item.input, {
      scorers: {},
      returnScorerData: true,
      runtimeContext: item.runtimeContext,
    });
  }
};

const runScorers = async <const TScorer extends readonly MastraScorer[]>(
  scorers: TScorer,
  targetResult: any,
  item: RunExperimentDataItem
): Promise<ScorerResults<TScorer>> => {
  const scorerResults: ScorerResults<TScorer> = {} as ScorerResults<TScorer>;

  for (const scorer of scorers) {
    try {
      const score = await scorer.run({
        input: targetResult.scoringData?.input,
        output: targetResult.scoringData?.output,
        groundTruth: item.groundTruth,
        runtimeContext: item.runtimeContext,
      });

      scorerResults[scorer.name as keyof ScorerResults<TScorer>] =
        score as ScorerResults<TScorer>[typeof scorer.name];
    } catch (error) {
      throw new MastraError(
        {
          domain: 'SCORER',
          id: 'RUN_EXPERIMENT_SCORER_FAILED_TO_SCORE_RESULT',
          category: 'USER',
          text: `Failed to run experiment: Error running scorer ${scorer.name}`,
          details: {
            scorerName: scorer.name,
            item: JSON.stringify(item),
          },
        },
        error,
      );
    }
  }

  return scorerResults;
};

