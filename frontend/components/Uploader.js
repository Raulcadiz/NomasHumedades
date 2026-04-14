import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";

export default function Uploader({ onFile }) {
  const [dragging, setDragging] = useState(false);

  const onDrop = useCallback(
    (acceptedFiles) => {
      if (acceptedFiles && acceptedFiles.length > 0) {
        onFile(acceptedFiles[0]);
      }
    },
    [onFile]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/*": [".jpeg", ".jpg", ".png", ".webp"],
    },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
    onDragEnter: () => setDragging(true),
    onDragLeave: () => setDragging(false),
  });

  return (
    <div
      {...getRootProps()}
      style={{
        border: "2px dashed var(--gray-300)",
        borderRadius: "var(--radius)",
        padding: "40px",
        textAlign: "center",
        cursor: "pointer",
        transition: "all 0.2s",
        background: isDragActive ? "rgba(37, 99, 235, 0.05)" : "transparent",
        borderColor: isDragActive ? "var(--primary)" : "var(--gray-300)",
      }}
    >
      <input {...getInputProps()} />
      <div style={{ fontSize: "48px", marginBottom: "16px" }}>📁</div>
      {isDragActive ? (
        <p>Suelta la imagen aquí...</p>
      ) : (
        <>
          <p>Arrastra una imagen aquí o haz clic para seleccionar</p>
          <p style={{ fontSize: "12px", color: "var(--gray-500)", marginTop: "8px" }}>
            Formatos: JPEG, PNG, WebP (máx 10 MB)
          </p>
        </>
      )}
    </div>
  );
}