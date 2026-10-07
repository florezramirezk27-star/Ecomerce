module.exports = {
  generateText: jest.fn(),
  streamText: jest.fn(),
  tool: jest.fn((config: unknown) => config),
  isStepCount: jest.fn(() => false),
};
