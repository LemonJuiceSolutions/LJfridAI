import { useCallback, useEffect, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button, Row, Col, Image } from 'react-bootstrap';

// Add a type for files with preview
interface FileWithPreview extends File {
  preview: string;
}

const DropzoneExample = () => {
  const [files, setFiles] = useState<FileWithPreview[]>([]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setFiles(
      acceptedFiles.map(
        (file: File) =>
          Object.assign(file, {
            preview: URL.createObjectURL(file),
          }) as FileWithPreview
      )
    );
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'image/*': [] },
    onDrop,
  });

  // Clean up previews
  useEffect(() => {
    return () => files.forEach((file) => URL.revokeObjectURL(file.preview));
  }, [files]);

  return (
    <>
      <div
        {...getRootProps()}
        className="text-center px-3 py-5"
        style={{
          border: '2px dashed var(--bs-border-color)',
          background: isDragActive ? 'var(--bs-secondary)' : 'var(--bs-input-bg)',
          cursor: 'pointer',
        }}
      >
        <input className="d-none" {...getInputProps()} />
        {isDragActive ? (
          <p>Drop the images here ...</p>
        ) : (
          <p>Drag & drop some images here, or click to select images</p>
        )}
        <Button variant="primary" size="sm" className="mt-3">
          Browse Files
        </Button>
      </div>

      {files.length > 0 && (
        <Row className="mt-4">
          {files.map((file, idx) => (
            <Col key={idx} xs={6} md={4} lg={3}>
              <Image src={file.preview} alt={file.name} thumbnail />
              <div className="mt-2 text-truncate">{file.name}</div>
            </Col>
          ))}
        </Row>
      )}
    </>
  );
};

export default DropzoneExample;
