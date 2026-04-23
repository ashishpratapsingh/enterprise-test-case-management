import { act, renderHook } from '@testing-library/react';
import { SnackbarProvider } from 'notistack';
import React from 'react';

jest.mock('../services/defectService', () => ({
  __esModule: true,
  default: {
    uploadAttachment: jest.fn(),
    deleteAttachment: jest.fn(),
    getAttachments: jest.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const defectService = require('../services/defectService').default;
const mockedService = defectService as jest.Mocked<any>;

// Must import the hook after the mock is declared.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const useDefectAttachments = require('./useDefectAttachments').default;

const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <SnackbarProvider>{children}</SnackbarProvider>
);

const makeFileList = (files: File[]): FileList => {
  const arr = files as unknown as FileList & { length: number };
  Object.defineProperty(arr, 'length', { value: files.length });
  Object.defineProperty(arr, 'item', { value: (i: number) => files[i] });
  return arr;
};

describe('useDefectAttachments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('stages pending files', () => {
    const { result } = renderHook(() => useDefectAttachments(), { wrapper });
    const files = makeFileList([new File(['a'], 'a.png', { type: 'image/png' })]);
    act(() => result.current.handleStageFiles(files));
    expect(result.current.pendingFiles).toHaveLength(1);
    expect(result.current.pendingFiles[0].name).toBe('a.png');
  });

  it('removes a pending file by index', () => {
    const { result } = renderHook(() => useDefectAttachments(), { wrapper });
    const files = makeFileList([
      new File(['a'], 'a.png'),
      new File(['b'], 'b.png'),
    ]);
    act(() => result.current.handleStageFiles(files));
    act(() => result.current.removePendingFile(0));
    expect(result.current.pendingFiles).toHaveLength(1);
    expect(result.current.pendingFiles[0].name).toBe('b.png');
  });

  it('uploadPendingFiles calls the service for each pending file and clears the queue', async () => {
    mockedService.uploadAttachment = jest.fn().mockResolvedValue({
      id: 'att-1',
      url: '/uploads/a.png',
      filename: 'a.png',
    });
    const { result } = renderHook(() => useDefectAttachments(), { wrapper });
    const files = makeFileList([
      new File(['a'], 'a.png'),
      new File(['b'], 'b.png'),
    ]);
    act(() => result.current.handleStageFiles(files));
    await act(async () => {
      await result.current.uploadPendingFiles('defect-1');
    });
    expect(mockedService.uploadAttachment).toHaveBeenCalledTimes(2);
    expect(result.current.pendingFiles).toHaveLength(0);
  });

  it('handleFileUpload appends to attachments on success', async () => {
    mockedService.uploadAttachment = jest.fn().mockResolvedValue({
      id: 'att-9',
      url: '/uploads/x.png',
      filename: 'x.png',
    });
    const { result } = renderHook(() => useDefectAttachments(), { wrapper });
    const files = makeFileList([new File(['x'], 'x.png')]);
    await act(async () => {
      await result.current.handleFileUpload('defect-1', files);
    });
    expect(result.current.attachments).toEqual([
      { id: 'att-9', url: '/uploads/x.png', filename: 'x.png' },
    ]);
    expect(result.current.uploadingFile).toBe(false);
  });

  it('handleRemoveAttachment calls the service and removes by index', async () => {
    mockedService.deleteAttachment = jest.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useDefectAttachments(), { wrapper });
    act(() => {
      result.current.setAttachments([
        { id: 'a1', url: '/u/1', filename: '1.png' },
        { id: 'a2', url: '/u/2', filename: '2.png' },
      ]);
    });
    await act(async () => {
      await result.current.handleRemoveAttachment(
        'defect-1',
        { id: 'a1', url: '/u/1', filename: '1.png' },
        0,
      );
    });
    expect(mockedService.deleteAttachment).toHaveBeenCalledWith('defect-1', 'a1');
    expect(result.current.attachments).toHaveLength(1);
    expect(result.current.attachments[0].id).toBe('a2');
  });

  it('loadAttachments populates state on success', async () => {
    mockedService.getAttachments = jest.fn().mockResolvedValue([
      { id: 'a1', url: '/u/1', filename: '1.png' },
    ]);
    const { result } = renderHook(() => useDefectAttachments(), { wrapper });
    await act(async () => {
      await result.current.loadAttachments('defect-1');
    });
    expect(result.current.attachments).toHaveLength(1);
  });

  it('loadAttachments resets to empty on error', async () => {
    mockedService.getAttachments = jest.fn().mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useDefectAttachments(), { wrapper });
    act(() => {
      result.current.setAttachments([{ id: 'old', url: '/old', filename: 'old' }]);
    });
    await act(async () => {
      await result.current.loadAttachments('defect-1');
    });
    expect(result.current.attachments).toEqual([]);
  });

  it('resetAttachments clears both queues', () => {
    const { result } = renderHook(() => useDefectAttachments(), { wrapper });
    act(() => {
      result.current.setAttachments([{ url: '/u', filename: 'f' }]);
      result.current.setPendingFiles([new File(['p'], 'p.png')]);
    });
    act(() => result.current.resetAttachments());
    expect(result.current.attachments).toEqual([]);
    expect(result.current.pendingFiles).toEqual([]);
  });
});
