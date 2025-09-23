export interface UploaderProps {
  mode: 'server' | 'client';
  url: string;
  access: 'public' | 'private';
  addRandomSuffix: boolean;
  contentType: string;
  contentDisposition: 'attachment' | 'inline';
  allowedFileTypes: string[];
  maxFileSize: number;
  multiple: boolean;
  multipart: boolean;
}
