const DEFAULT_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300' viewBox='0 0 400 300'%3E%3Crect fill='%23f3f4f6' width='400' height='300'/%3E%3Ctext fill='%239ca3af' font-family='Arial' font-size='20' x='50%25' y='50%25' text-anchor='middle'%3ESin imagen%3C/text%3E%3C/svg%3E";

export default function ProductImage({ src, alt, style = {} }) {
  const handleError = (e) => {
    e.target.src = DEFAULT_IMAGE;
  };

  if (!src) {
    return (
      <div style={{ 
        backgroundColor: "#f3f4f6", 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "center",
        color: "#9ca3af",
        fontSize: "14px",
        ...style 
      }}>
        Sin imagen
      </div>
    );
  }

  return (
    <img 
      src={src} 
      alt={alt} 
      style={style}
      onError={handleError}
    />
  );
}