import { describe, it, expect, beforeAll } from 'bun:test';
import { LlmService } from './llm.service';

describe('LlmService analyze performance test', () => {
  let llmService: LlmService;

  // Generate 10 test cases with varied content
  const testCases = [
    'Artificial intelligence is transforming the way we work and live. Machine learning algorithms can now process vast amounts of data to identify patterns and make predictions.',
    'Climate change is one of the most pressing issues of our time. Rising global temperatures are causing sea levels to rise and extreme weather events to become more frequent.',
    'The history of computing spans from early mechanical calculators to modern quantum computers. Each generation has brought new capabilities and challenges.',
    'Renewable energy sources like solar and wind power are becoming increasingly cost-effective. Many countries are investing heavily in green energy infrastructure.',
    'Space exploration has captured human imagination for centuries. Recent missions to Mars and beyond are opening new frontiers for scientific discovery.',
    'The internet has revolutionized communication and information sharing. Social media platforms connect billions of people worldwide in real-time.',
    'Medical research continues to advance our understanding of human health. Breakthroughs in genetics and biotechnology offer hope for treating previously incurable diseases.',
    'Education systems worldwide are adapting to digital learning environments. Online courses and virtual classrooms are making education more accessible.',
    'Sustainable agriculture practices are essential for feeding a growing global population. Organic farming and precision agriculture are gaining traction.',
    'Cybersecurity threats are evolving rapidly as technology becomes more integrated into daily life. Protecting digital infrastructure requires constant vigilance and innovation.',
  ];

  beforeAll(() => {
    llmService = new LlmService();
  });

  it('should run analyze sequentially and measure time', async () => {
    console.log('\n=== Running Sequential Analysis ===');
    const startTime = Date.now();
    const results: Array<{ summary: string; tags: string[] }> = [];

    for (let i = 0; i < testCases.length; i++) {
      const caseStart = Date.now();
      const result = await llmService.analyze(testCases[i]);
      const caseElapsed = Date.now() - caseStart;
      results.push(result);
      console.log(`Case ${i + 1}: ${caseElapsed}ms - Summary: "${result.summary.substring(0, 50)}..." - Tags: ${result.tags.length}`);
    }

    const totalTime = Date.now() - startTime;
    const averageTime = totalTime / testCases.length;

    console.log(`\nSequential Results:`);
    console.log(`  Total time: ${totalTime}ms`);
    console.log(`  Average time per case: ${averageTime.toFixed(2)}ms`);
    console.log(`  Total cases: ${testCases.length}`);

    // Verify all results were generated
    expect(results).toHaveLength(testCases.length);
    results.forEach((result) => {
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('tags');
      expect(Array.isArray(result.tags)).toBe(true);
    });

    return { totalTime, averageTime, results };
  }, 300000); // 5 minute timeout for sequential

  it('should run analyze in parallel and measure time', async () => {
    console.log('\n=== Running Parallel Analysis ===');
    const startTime = Date.now();

    // Run all analyses in parallel
    const results = await Promise.all(
      testCases.map((content, index) => {
        const caseStart = Date.now();
        return llmService.analyze(content).then((result) => {
          const caseElapsed = Date.now() - caseStart;
          console.log(`Case ${index + 1}: ${caseElapsed}ms - Summary: "${result.summary.substring(0, 50)}..." - Tags: ${result.tags.length}`);
          return result;
        });
      }),
    );

    const totalTime = Date.now() - startTime;
    const averageTime = totalTime / testCases.length;

    console.log(`\nParallel Results:`);
    console.log(`  Total time: ${totalTime}ms`);
    console.log(`  Average time per case: ${averageTime.toFixed(2)}ms`);
    console.log(`  Total cases: ${testCases.length}`);

    // Verify all results were generated
    expect(results).toHaveLength(testCases.length);
    results.forEach((result) => {
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('tags');
      expect(Array.isArray(result.tags)).toBe(true);
    });

    return { totalTime, averageTime, results };
  }, 300000); // 5 minute timeout for parallel

  it('should compare sequential vs parallel performance', async () => {
    console.log('\n=== Performance Comparison Test ===\n');

    // Sequential run
    console.log('Running sequential analysis...');
    const sequentialStart = Date.now();
    const sequentialResults = [];
    for (const content of testCases) {
      sequentialResults.push(await llmService.analyze(content));
    }
    const sequentialTime = Date.now() - sequentialStart;

    // Parallel run
    console.log('Running parallel analysis...');
    const parallelStart = Date.now();
    const parallelResults = await Promise.all(
      testCases.map((content) => llmService.analyze(content)),
    );
    const parallelTime = Date.now() - parallelStart;

    // Calculate metrics
    const speedup = sequentialTime / parallelTime;
    const timeSaved = sequentialTime - parallelTime;
    const efficiency = (timeSaved / sequentialTime) * 100;

    console.log('\n=== Performance Comparison Results ===');
    console.log(`Sequential total time: ${sequentialTime}ms`);
    console.log(`Parallel total time: ${parallelTime}ms`);
    console.log(`Speedup: ${speedup.toFixed(2)}x`);
    console.log(`Time saved: ${timeSaved}ms (${efficiency.toFixed(2)}% faster)`);

    // Verify results match
    expect(sequentialResults).toHaveLength(parallelResults.length);
    sequentialResults.forEach((seqResult, index) => {
      const parResult = parallelResults[index];
      expect(seqResult).toHaveProperty('summary');
      expect(seqResult).toHaveProperty('tags');
      expect(parResult).toHaveProperty('summary');
      expect(parResult).toHaveProperty('tags');
    });

    // Assert that parallel should be faster (or at least not significantly slower)
    // We allow some tolerance for network variability
    expect(parallelTime).toBeLessThan(sequentialTime * 1.5);

    return {
      sequentialTime,
      parallelTime,
      speedup,
      timeSaved,
      efficiency,
    };
  }, 600000); // 10 minute timeout for full comparison
});
