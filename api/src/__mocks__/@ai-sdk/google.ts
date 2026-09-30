// El paquete @ai-sdk/google es ESM puro y el jest unitario transforma a
// CommonJS, asi que no se puede importar. Este mock lo sustituye para poder
// probar el AIService sin salir a la red. El mismo problema arrastra al
// paquete "ai", que tiene su mock en src/__mocks__/ai.ts.
module.exports = {
  google: jest.fn((model) => ({ model, provider: 'google' })),
};
