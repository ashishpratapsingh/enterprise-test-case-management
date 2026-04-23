import { useRef, useState } from 'react';
import { useSnackbar } from 'notistack';
import defectService from '../services/defectService';

export interface Attachment {
  id?: string;
  url: string;
  filename: string;
}

/**
 * Manages the attachment lifecycle for a defect create/edit flow.
 *
 * - `pendingFiles` holds files selected before the defect exists (create flow).
 *   Call `uploadPendingFiles(defectId)` after the defect is created to persist them.
 * - `attachments` holds already-persisted attachments for an existing defect.
 *   Call `loadAttachments(defectId)` when opening an edit/view dialog.
 * - `handleFileUpload` uploads immediately for an existing defect.
 */
export function useDefectAttachments() {
  const { enqueueSnackbar } = useSnackbar();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleStageFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setPendingFiles((prev) => [...prev, ...Array.from(files)]);
  };

  const removePendingFile = (idx: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const uploadPendingFiles = async (defectId: string) => {
    if (pendingFiles.length === 0) return;
    for (const file of pendingFiles) {
      try {
        await defectService.uploadAttachment(defectId, file);
      } catch {
        enqueueSnackbar(`Failed to upload: ${file.name}`, { variant: 'error' });
      }
    }
    setPendingFiles([]);
  };

  const handleFileUpload = async (defectId: string, files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingFile(true);
    for (const file of Array.from(files)) {
      try {
        const result = await defectService.uploadAttachment(defectId, file);
        setAttachments((prev) => [...prev, { id: result.id, url: result.url, filename: result.filename }]);
        enqueueSnackbar(`Uploaded: ${file.name}`, { variant: 'success' });
      } catch {
        enqueueSnackbar(`Failed to upload: ${file.name}`, { variant: 'error' });
      }
    }
    setUploadingFile(false);
  };

  const handleRemoveAttachment = async (defectId: string, att: Attachment, idx: number) => {
    if (att.id) {
      try {
        await defectService.deleteAttachment(defectId, att.id);
        enqueueSnackbar('Attachment removed', { variant: 'success' });
      } catch {
        enqueueSnackbar('Failed to remove attachment', { variant: 'error' });
        return;
      }
    }
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  const loadAttachments = async (defectId: string) => {
    try {
      const atts = await defectService.getAttachments(defectId);
      setAttachments(atts.map((a: any) => ({ id: a.id, url: a.url, filename: a.filename })));
    } catch {
      setAttachments([]);
    }
  };

  const resetAttachments = () => {
    setAttachments([]);
    setPendingFiles([]);
  };

  return {
    attachments,
    setAttachments,
    pendingFiles,
    setPendingFiles,
    uploadingFile,
    fileInputRef,
    handleStageFiles,
    removePendingFile,
    uploadPendingFiles,
    handleFileUpload,
    handleRemoveAttachment,
    loadAttachments,
    resetAttachments,
  };
}

export default useDefectAttachments;
