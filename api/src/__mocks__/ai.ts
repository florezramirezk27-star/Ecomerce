module.exports = {
  generateText: jest.fn(),
  streamText: jest.fn(),
  tool: jest.fn((config) => config),
  isStepCount: jest.fn(() => false),
};
