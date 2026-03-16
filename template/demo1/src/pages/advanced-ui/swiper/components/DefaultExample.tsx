import { Swiper, SwiperSlide } from 'swiper/react';
import 'swiper/css';
import { IMAGES } from './images';
import { getUrl } from '@/utils/getUrl';

const DefaultExample = () => {
  return (
    <>
      <Swiper>
        {IMAGES.map((image) => (
          <SwiperSlide key={image.id}>
            <img src={getUrl(image.src)} alt={image.alt} title={image.title} className="w-100" />
          </SwiperSlide>
        ))}
      </Swiper>
    </>
  );
};

export default DefaultExample;
