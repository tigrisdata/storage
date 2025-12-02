import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Uploader } from './Uploader';

// Mock the useUpload hook
vi.mock('../hooks/useUpload', () => ({
  useUpload: vi.fn(() => ({
    upload: vi.fn(),
    uploadMultiple: vi.fn(),
    uploads: new Map(),
    isUploading: false,
    reset: vi.fn(),
  })),
}));

import { useUpload } from '../hooks/useUpload';

describe('Uploader', () => {
  const mockUrl = '/api/upload';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render with default text', () => {
    render(<Uploader url={mockUrl} />);

    expect(screen.getByText(/drag and drop/i)).toBeInTheDocument();
    expect(screen.getByText(/browse/i)).toBeInTheDocument();
  });

  it('should render custom children', () => {
    render(
      <Uploader url={mockUrl}>
        <div>Custom content</div>
      </Uploader>
    );

    expect(screen.getByText('Custom content')).toBeInTheDocument();
  });

  it('should apply custom className', () => {
    render(<Uploader url={mockUrl} className="custom-class" />);

    const container = document.querySelector('.tigris-uploader');
    expect(container).toHaveClass('custom-class');
  });

  it('should apply custom style', () => {
    render(<Uploader url={mockUrl} style={{ backgroundColor: 'red' }} />);

    const container = document.querySelector('.tigris-uploader') as HTMLElement;
    expect(container.style.backgroundColor).toBe('red');
  });

  it('should have is-disabled class when disabled', () => {
    render(<Uploader url={mockUrl} disabled />);

    const container = document.querySelector('.tigris-uploader');
    expect(container).toHaveClass('is-disabled');
  });

  it('should have is-uploading class when uploading', () => {
    vi.mocked(useUpload).mockReturnValue({
      upload: vi.fn(),
      uploadMultiple: vi.fn(),
      uploads: new Map(),
      isUploading: true,
      reset: vi.fn(),
    });

    render(<Uploader url={mockUrl} />);

    const container = document.querySelector('.tigris-uploader');
    expect(container).toHaveClass('is-uploading');
  });

  it('should show "Uploading..." text when uploading', () => {
    vi.mocked(useUpload).mockReturnValue({
      upload: vi.fn(),
      uploadMultiple: vi.fn(),
      uploads: new Map(),
      isUploading: true,
      reset: vi.fn(),
    });

    render(<Uploader url={mockUrl} />);

    expect(screen.getByText('Uploading...')).toBeInTheDocument();
  });

  it('should trigger file input click on container click', () => {
    render(<Uploader url={mockUrl} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, 'click');

    const container = document.querySelector('.tigris-uploader') as HTMLElement;
    fireEvent.click(container);

    expect(clickSpy).toHaveBeenCalled();
  });

  it('should not trigger file input when disabled', () => {
    render(<Uploader url={mockUrl} disabled />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, 'click');

    const container = document.querySelector('.tigris-uploader') as HTMLElement;
    fireEvent.click(container);

    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('should set accept attribute on file input', () => {
    render(<Uploader url={mockUrl} accept="image/*" />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toHaveAttribute('accept', 'image/*');
  });

  it('should set multiple attribute when multiple is true', () => {
    render(<Uploader url={mockUrl} multiple />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toHaveAttribute('multiple');
  });

  it('should call upload when file is selected', () => {
    const mockUpload = vi.fn();
    vi.mocked(useUpload).mockReturnValue({
      upload: mockUpload,
      uploadMultiple: vi.fn(),
      uploads: new Map(),
      isUploading: false,
      reset: vi.fn(),
    });

    render(<Uploader url={mockUrl} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['test'], 'test.txt', { type: 'text/plain' });

    Object.defineProperty(input, 'files', {
      value: [file],
    });

    fireEvent.change(input);

    expect(mockUpload).toHaveBeenCalledWith(file);
  });

  it('should call uploadMultiple when multiple files are selected', () => {
    const mockUploadMultiple = vi.fn();
    vi.mocked(useUpload).mockReturnValue({
      upload: vi.fn(),
      uploadMultiple: mockUploadMultiple,
      uploads: new Map(),
      isUploading: false,
      reset: vi.fn(),
    });

    render(<Uploader url={mockUrl} multiple />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file1 = new File(['test1'], 'test1.txt', { type: 'text/plain' });
    const file2 = new File(['test2'], 'test2.txt', { type: 'text/plain' });

    Object.defineProperty(input, 'files', {
      value: [file1, file2],
    });

    fireEvent.change(input);

    expect(mockUploadMultiple).toHaveBeenCalledWith([file1, file2]);
  });

  it('should call onUploadError when file exceeds maxSize', () => {
    const onUploadError = vi.fn();
    render(<Uploader url={mockUrl} maxSize={100} onUploadError={onUploadError} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const largeFile = new File(['x'.repeat(200)], 'large.txt', { type: 'text/plain' });

    Object.defineProperty(input, 'files', {
      value: [largeFile],
    });

    fireEvent.change(input);

    expect(onUploadError).toHaveBeenCalledWith(
      largeFile,
      expect.objectContaining({
        message: expect.stringContaining('exceeds maximum'),
      })
    );
  });

  it('should reject all files when maxSize is 0', () => {
    const onUploadError = vi.fn();
    render(<Uploader url={mockUrl} maxSize={0} onUploadError={onUploadError} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['test'], 'test.txt', { type: 'text/plain' });

    Object.defineProperty(input, 'files', {
      value: [file],
    });

    fireEvent.change(input);

    expect(onUploadError).toHaveBeenCalledWith(
      file,
      expect.objectContaining({
        message: expect.stringContaining('exceeds maximum'),
      })
    );
  });

  it('should add is-dragging class on drag over', () => {
    render(<Uploader url={mockUrl} />);

    const container = document.querySelector('.tigris-uploader') as HTMLElement;

    fireEvent.dragOver(container);

    expect(container).toHaveClass('is-dragging');
  });

  it('should remove is-dragging class on drag leave', () => {
    render(<Uploader url={mockUrl} />);

    const container = document.querySelector('.tigris-uploader') as HTMLElement;

    fireEvent.dragOver(container);
    expect(container).toHaveClass('is-dragging');

    fireEvent.dragLeave(container);
    expect(container).not.toHaveClass('is-dragging');
  });

  it('should handle file drop', () => {
    const mockUpload = vi.fn();
    vi.mocked(useUpload).mockReturnValue({
      upload: mockUpload,
      uploadMultiple: vi.fn(),
      uploads: new Map(),
      isUploading: false,
      reset: vi.fn(),
    });

    render(<Uploader url={mockUrl} />);

    const container = document.querySelector('.tigris-uploader') as HTMLElement;
    const file = new File(['test'], 'test.txt', { type: 'text/plain' });

    const dataTransfer = {
      files: [file],
    };

    fireEvent.drop(container, { dataTransfer });

    expect(mockUpload).toHaveBeenCalledWith(file);
  });

  it('should pass multipart options to useUpload', () => {
    render(
      <Uploader
        url={mockUrl}
        multipart
        partSize={10 * 1024 * 1024}
        multipartThreshold={5 * 1024 * 1024}
      />
    );

    expect(useUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        url: mockUrl,
        multipart: true,
        partSize: 10 * 1024 * 1024,
        multipartThreshold: 5 * 1024 * 1024,
      })
    );
  });

  it('should display file list when there are uploads', () => {
    const mockFile = new File(['test'], 'test.txt', { type: 'text/plain' });
    const uploadsMap = new Map([
      [
        'test-key',
        {
          file: mockFile,
          status: 'uploading' as const,
          progress: { loaded: 50, total: 100, percentage: 50 },
        },
      ],
    ]);

    vi.mocked(useUpload).mockReturnValue({
      upload: vi.fn(),
      uploadMultiple: vi.fn(),
      uploads: uploadsMap,
      isUploading: true,
      reset: vi.fn(),
    });

    render(<Uploader url={mockUrl} />);

    expect(screen.getByText('test.txt')).toBeInTheDocument();
    expect(document.querySelector('.tigris-uploader-progress')).toBeInTheDocument();
  });

  it('should show success status for completed uploads', () => {
    const mockFile = new File(['test'], 'test.txt', { type: 'text/plain' });
    const uploadsMap = new Map([
      [
        'test-key',
        {
          file: mockFile,
          status: 'success' as const,
          progress: { loaded: 100, total: 100, percentage: 100 },
          response: { name: 'test.txt', url: '', size: 100, modified: new Date() },
        },
      ],
    ]);

    vi.mocked(useUpload).mockReturnValue({
      upload: vi.fn(),
      uploadMultiple: vi.fn(),
      uploads: uploadsMap,
      isUploading: false,
      reset: vi.fn(),
    });

    render(<Uploader url={mockUrl} />);

    expect(screen.getByText('Uploaded')).toBeInTheDocument();
    expect(document.querySelector('.tigris-uploader-file')).toHaveClass('is-success');
  });

  it('should show error status for failed uploads', () => {
    const mockFile = new File(['test'], 'test.txt', { type: 'text/plain' });
    const uploadsMap = new Map([
      [
        'test-key',
        {
          file: mockFile,
          status: 'error' as const,
          progress: { loaded: 0, total: 100, percentage: 0 },
          error: new Error('Upload failed'),
        },
      ],
    ]);

    vi.mocked(useUpload).mockReturnValue({
      upload: vi.fn(),
      uploadMultiple: vi.fn(),
      uploads: uploadsMap,
      isUploading: false,
      reset: vi.fn(),
    });

    render(<Uploader url={mockUrl} />);

    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(document.querySelector('.tigris-uploader-file')).toHaveClass('is-error');
  });

  it('should be accessible via keyboard', () => {
    render(<Uploader url={mockUrl} />);

    const container = document.querySelector('.tigris-uploader') as HTMLElement;
    expect(container).toHaveAttribute('role', 'button');
    expect(container).toHaveAttribute('tabIndex', '0');
  });

  it('should trigger click on Enter key', () => {
    render(<Uploader url={mockUrl} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, 'click');

    const container = document.querySelector('.tigris-uploader') as HTMLElement;
    fireEvent.keyDown(container, { key: 'Enter' });

    expect(clickSpy).toHaveBeenCalled();
  });

  it('should trigger click on Space key', () => {
    render(<Uploader url={mockUrl} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, 'click');

    const container = document.querySelector('.tigris-uploader') as HTMLElement;
    fireEvent.keyDown(container, { key: ' ' });

    expect(clickSpy).toHaveBeenCalled();
  });
});
