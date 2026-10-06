// El paquete @ai-sdk/openai-compatible es ESM puro y el jest unitario
// transforma a CommonJS, asi que no se puede importar. Este mock lo sustituye
// para poder probar el AIService sin salir a la red. El mismo problema arrastra
// al paquete "ai", que tiene su mock en src/__mocks__/ai.ts.
const languageModel = jest.fn((model: string) => ({
  model,
  provider: 'openrouter',
}));

module.exports = {
  createOpenAICompatible: jest.fn(() => ({
    languageModel,
    chatModel: languageModel,
  })),
};
