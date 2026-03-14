import { Swiper, SwiperSlide } from 'swiper/react';
import { Pagination, EffectCoverflow } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/effect-coverflow';
import { getUrl } from '@/utils/getUrl';
import { IMAGES } from './images';

const EffectCoverflowExample = () => {
  return (
    <>
      <Swiper
        initialSlide={3}
        effect={'coverflow'}
        grabCursor={true}
        centeredSlides={true}
        slidesPerView={'auto'}
        coverflowEffect={{
          rotate: 50,
          stretch: 0,
          depth: 100,
          modifier: 1,
          slideShadows: true,
        }}
        pagination={true}
        modules={[EffectCoverflow, Pagination]}
      >
        {IMAGES.map((image) => (
          <SwiperSlide key={image.id} className="w-400px">
            <img src={getUrl(image.src)} alt={image.alt} title={image.title} className="w-100" />
          </SwiperSlide>
        ))}
      </Swiper>
    </>
  );
};

export default EffectCoverflowExample;
