module.exports = {
  createOpenAI: jest.fn(() => ({
    chat: jest.fn(),
  })),
};
