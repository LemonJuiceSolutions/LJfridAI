import { useState } from 'react';
import Cropper, { Area, Point } from 'react-easy-crop';
import { Col, Form, Row } from 'react-bootstrap';
import myImage from '/images/photos/img.webp';

const CROP_AREA_ASPECT = 3 / 2;

const ImageCropperExample = () => {
  const [imgSrc, setImgSrc] = useState(myImage);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);

  const onSelectFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        setImgSrc(reader.result as string);
        setZoom(1); // Reset zoom
        setCrop({ x: 0, y: 0 }); // Reset crop position
        setCroppedArea(null); // Reset cropped area
      });
      reader.readAsDataURL(event.target.files[0]);
    }
  };

  // const onCropComplete = (croppedArea: Area, croppedAreaPixels: Area) => {
  //   console.log(croppedArea, croppedAreaPixels)
  // }

  const Output = ({ croppedArea }: { croppedArea: Area }) => {
    const scale = 100 / croppedArea.width;
    const transform = {
      x: `${-croppedArea.x * scale}%`,
      y: `${-croppedArea.y * scale}%`,
      scale,
      width: 'calc(100% + 0.5px)',
      height: 'auto',
    };

    const imageStyle: React.CSSProperties = {
      transform: `translate3d(${transform.x}, ${transform.y}, 0) scale3d(${transform.scale},${transform.scale},1)`,
      width: transform.width,
      height: transform.height,
      transformOrigin: 'top left',
      position: 'absolute',
      top: 0,
      left: 0,
    };

    return (
      <div className="output overflow-hidden position-relative" style={{ paddingBottom: `${100 / CROP_AREA_ASPECT}%` }}>
        <img src={imgSrc} alt="" style={imageStyle} />
      </div>
    );
  };

  return (
    <>
      <div>
        <Form.Control type="file" className="mb-3" onChange={onSelectFile} />
      </div>
      <Row>
        <Col md={8}>
          <div className="position-relative h-500px">
            <Cropper
              image={imgSrc}
              aspect={CROP_AREA_ASPECT}
              crop={crop}
              zoom={zoom}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              // onCropComplete={onCropComplete}
              onCropAreaChange={setCroppedArea}
            />
          </div>
        </Col>
        <Col md={4}>
          <h6 className="text-secondary mb-3">Cropped Image Preview: </h6>
          {croppedArea && <Output croppedArea={croppedArea} />}
        </Col>
      </Row>
    </>
  );
};

export default ImageCropperExample;
