import { ChangeEvent, DragEvent, useCallback, useMemo, useRef } from 'react';
import { UploaderProps, UploadItem, UploadMetadata } from '../types';

export function Uploader(props: UploaderProps) {
  const dropZone = useRef<HTMLDivElement>(null);
  const {
    className,
    mode,
    allowDrop,
    /*url,
    access,
    addRandomSuffix,
    contentType,
    allowedFileTypes,
    maxFileSize,
    multiple,
    multipart,
    ,
    onUploadProgress,*/
  } = props;

  const dropZoneClass = 'dragged';

  const handleDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (dropZone.current) {
        if (!dropZone.current.classList.contains(dropZoneClass)) {
          dropZone.current.classList.add(dropZoneClass);
        }
      }
    },
    [dropZoneClass]
  );

  const handleDragLeave = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();

      /*
      This is ensure that we only remove class when actually dragging out of the drop zone.
      and not a child of the drop zone.
      */
      if (e.currentTarget.contains(e.relatedTarget as Node)) {
        return;
      }

      if (dropZone.current) {
        dropZone.current.classList.remove(dropZoneClass);
      }
    },
    [dropZoneClass]
  );

  const handleDrop = (args: unknown) => {
    (args as DragEvent).preventDefault();
    (args as DragEvent).stopPropagation();
    console.log(args);
  };

  const attributes = useMemo(() => {
    if (allowDrop) {
      const attrs = {
        className:
          'group flex flex-col grow relative rounded-lg border border-transparent [.dragged]:opacity-20',
      };

      const eventHandlers = {
        onDrop: handleDrop,
        onDragOver: handleDragOver,
        onDragEnter: handleDragOver,
        onDragEnd: handleDragLeave,
        onDragLeave: handleDragLeave,
      };

      return {
        ...attrs,
        ...eventHandlers,
      };
    }

    return {};
  }, [handleDrop, handleDragLeave, handleDragOver, allowDrop]);

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

  const classN = [
    'flex grow',
    'justify-center items-center',
    'px-6 py-10',
    'border border-dashed rounded-lg',
    'pointer-events-auto',
    'ease-out duration-100',
    'bg-blue-50',
    'hover:bg-blue-100',
  ];

  return (
    <div {...attributes} ref={dropZone} className={className}>
      <div className="flex grow relative">
        <div className={classN.join(' ')}>
          <div className="flex flex-col items-center justify-center">
            <div className="mt-2 text-reg leading-6 text-gray flex justify-center">
              <span>Drag and drop or</span>
              <label htmlFor={`object-upload-${mode}`}>
                <p className="px-1 underline cursor-pointer rounded-md font-bold text-gray-700 hover:text-gray-700">
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
      </div>
    </div>
  );
}
