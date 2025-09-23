import { ChangeEvent, useCallback } from 'react';
import { UploaderProps, UploadItem, UploadMetadata } from '../types';

export function Uploader(props: UploaderProps) {
  const {
    className,
    mode,
    /*url,
    access,
    addRandomSuffix,
    contentType,
    allowedFileTypes,
    maxFileSize,
    multiple,
    multipart,
    dragAndDrop,
    onUploadProgress,*/
  } = props;

  const getMetadata = useCallback((fileName: string): UploadMetadata => {
    return {
      key: fileName,
      progress: {
        loaded: 0,
        total: 0,
        percentage: 0,
      },
      status: 'queued',
    };
  }, []);

  const getObjectsFromInputEvent = useCallback(
    (files: FileList) => {
      const objectsFromInput: UploadItem[] = Array.from(files).map((file) => ({
        object: file,
        metadata: getMetadata(file.name),
      }));

      return objectsFromInput;
    },
    [getMetadata]
  );

  const handleInputChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      event.preventDefault();
      const eventFiles = event.target.files;
      if (eventFiles && eventFiles.length > 0) {
        const objects = getObjectsFromInputEvent(eventFiles);
        console.log({ objects });
      }
    },
    [getObjectsFromInputEvent]
  );

  return (
    <div className="flex flex-col items-center justify-center">
      <div className={`border border-gray-300 rounded-md p-4 ${className}`}>
        <div className="mt-2 text-reg leading-6 text-gray flex justify-center">
          <span>Drag and drop or</span>
          <label htmlFor={`object-upload-${mode}`}>
            <p className="px-1 underline cursor-pointer rounded-md font-bold text-indigo hover:text-indigo-700">
              browse
            </p>
            <input
              id={`tigris-uploader`}
              name={`tigris-uploader`}
              type="file"
              className="sr-only"
              value={''}
              multiple
              onChange={handleInputChange}
            />
          </label>
          <span>files.</span>
        </div>
      </div>
    </div>
  );
}
