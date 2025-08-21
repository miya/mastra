export class ScoreAccumulator {
  private scores: Record<string, number[]> = {};

  addScores(scorerResults: Record<string, any>) {
    for (const [scorerName, result] of Object.entries(scorerResults)) {
      if (!this.scores[scorerName]) {
        this.scores[scorerName] = [];
      }
      this.scores[scorerName].push((result as { score: number }).score);
    }
  }

  addStepScores(stepScorerResults: Record<string, Record<string, any>>) {
    for (const stepResults of Object.values(stepScorerResults)) {
      for (const [scorerName, result] of Object.entries(stepResults)) {
        if (!this.scores[scorerName]) {
          this.scores[scorerName] = [];
        }
        this.scores[scorerName].push((result as { score: number }).score);
      }
    }
  }

  getAverageScores(): Record<string, number> {
    const averageScores: Record<string, number> = {};
    for (const [scorerName, scoreArray] of Object.entries(this.scores)) {
      averageScores[scorerName] = scoreArray.reduce((a, b) => a + b, 0) / scoreArray.length;
    }
    return averageScores;
  }
}