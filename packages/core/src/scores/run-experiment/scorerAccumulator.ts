export class ScoreAccumulator {
  private flatScores: Record<string, number[]> = {};
  private workflowScores: Record<string, number[]> = {};
  private stepScores: Record<string, Record<string, number[]>> = {};

  addScores(scorerResults: Record<string, any>) {
    // Check if this is the new nested structure
    if ('workflow' in scorerResults || 'stepScorers' in scorerResults) {
      this.addNestedScores(scorerResults);
    } else {
      // Handle flat structure (existing behavior)
      this.addFlatScores(scorerResults);
    }
  }

  private addFlatScores(scorerResults: Record<string, any>) {
    for (const [scorerName, result] of Object.entries(scorerResults)) {
      if (!this.flatScores[scorerName]) {
        this.flatScores[scorerName] = [];
      }
      this.flatScores[scorerName].push((result as { score: number }).score);
    }
  }

  private addNestedScores(scorerResults: Record<string, any>) {
    // Handle workflow-level scorers
    if ('workflow' in scorerResults && scorerResults.workflow) {
      for (const [scorerName, result] of Object.entries(scorerResults.workflow)) {
        if (!this.workflowScores[scorerName]) {
          this.workflowScores[scorerName] = [];
        }
        this.workflowScores[scorerName].push((result as { score: number }).score);
      }
    }

    // Handle step-level scorers
    if ('stepScorers' in scorerResults && scorerResults.stepScorers) {
      for (const [stepId, stepResults] of Object.entries(scorerResults.stepScorers)) {
        if (!this.stepScores[stepId]) {
          this.stepScores[stepId] = {};
        }
        for (const [scorerName, result] of Object.entries(stepResults as Record<string, any>)) {
          if (!this.stepScores[stepId][scorerName]) {
            this.stepScores[stepId][scorerName] = [];
          }
          this.stepScores[stepId][scorerName].push((result as { score: number }).score);
        }
      }
    }
  }

  addStepScores(stepScorerResults: Record<string, Record<string, any>>) {
    for (const [stepId, stepResults] of Object.entries(stepScorerResults)) {
      if (!this.stepScores[stepId]) {
        this.stepScores[stepId] = {};
      }
      for (const [scorerName, result] of Object.entries(stepResults)) {
        if (!this.stepScores[stepId][scorerName]) {
          this.stepScores[stepId][scorerName] = [];
        }
        this.stepScores[stepId][scorerName].push((result as { score: number }).score);
      }
    }
  }

  getAverageScores(): Record<string, any> {
    const result: Record<string, any> = {};

    // Add flat scores (for backward compatibility)
    for (const [scorerName, scoreArray] of Object.entries(this.flatScores)) {
      result[scorerName] = scoreArray.reduce((a, b) => a + b, 0) / scoreArray.length;
    }

    // Add workflow scores
    if (Object.keys(this.workflowScores).length > 0) {
      result.workflow = {};
      for (const [scorerName, scoreArray] of Object.entries(this.workflowScores)) {
        result.workflow[scorerName] = scoreArray.reduce((a, b) => a + b, 0) / scoreArray.length;
      }
    }

    // Add step scores
    if (Object.keys(this.stepScores).length > 0) {
      result.steps = {};
      for (const [stepId, stepScorers] of Object.entries(this.stepScores)) {
        result.steps[stepId] = {};
        for (const [scorerName, scoreArray] of Object.entries(stepScorers)) {
          result.steps[stepId][scorerName] = scoreArray.reduce((a, b) => a + b, 0) / scoreArray.length;
        }
      }
    }

    return result;
  }
}
