// Jest auto-mock for axios. Real axios is ESM and cannot be transformed by
// the default react-scripts Jest config. Any test that ends up importing
// `axios` transitively (via services/api.ts) will receive this stub instead.
//
// Individual service modules should be mocked per-test with `jest.mock(...)`
// so tests can assert on calls; this stub just prevents the transform error.

const stub = {
  get: jest.fn().mockResolvedValue({ data: null }),
  post: jest.fn().mockResolvedValue({ data: null }),
  put: jest.fn().mockResolvedValue({ data: null }),
  delete: jest.fn().mockResolvedValue({ data: null }),
  patch: jest.fn().mockResolvedValue({ data: null }),
  interceptors: {
    request: { use: jest.fn(), eject: jest.fn() },
    response: { use: jest.fn(), eject: jest.fn() },
  },
};

const axios = {
  ...stub,
  create: jest.fn(() => stub),
  isAxiosError: (_: unknown) => false,
};

export default axios;
export const AxiosError = class AxiosError extends Error {};
export const InternalAxiosRequestConfig = {};
