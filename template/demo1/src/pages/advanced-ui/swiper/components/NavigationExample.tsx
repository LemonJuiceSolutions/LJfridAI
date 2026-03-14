import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/navigation';
import { IMAGES } from './images';
import { getUrl } from '@/utils/getUrl';
const NavigationExample = () => {
  return (
    <>
      <Swiper initialSlide={1} navigation={true} modules={[Navigation]}>
        {IMAGES.map((image) => (
          <SwiperSlide key={image.id}>
            <img src={getUrl(image.src)} alt={image.alt} title={image.title} className="w-100" />
          </SwiperSlide>
        ))}
      </Swiper>
    </>
  );
};

export default NavigationExample;
