import { Swiper, SwiperSlide } from 'swiper/react';
import { FreeMode, Navigation, Thumbs } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/free-mode';
import 'swiper/css/navigation';
import 'swiper/css/thumbs';
import { IMAGES } from './images';
import { useState } from 'react';
import type { Swiper as SwiperType } from 'swiper';
import { getUrl } from '@/utils/getUrl';
const ThumbsGalleryExample = () => {
  const [thumbsSwiper, setThumbsSwiper] = useState<SwiperType | null>(null);

  return (
    <>
      <Swiper
        spaceBetween={10}
        navigation={true}
        thumbs={{ swiper: thumbsSwiper }}
        modules={[FreeMode, Navigation, Thumbs]}
      >
        {IMAGES.map((image) => (
          <SwiperSlide key={image.id}>
            <img src={getUrl(image.src)} alt={image.alt} title={image.title} className="w-100" />
          </SwiperSlide>
        ))}
      </Swiper>
      <Swiper
        onSwiper={setThumbsSwiper}
        spaceBetween={10}
        slidesPerView={8}
        freeMode={true}
        watchSlidesProgress={true}
        modules={[FreeMode, Navigation, Thumbs]}
        className="thumb-swiper pt-2"
      >
        {IMAGES.map((image) => (
          <SwiperSlide key={image.id}>
            <img src={getUrl(image.src)} alt={image.alt} title={image.title} className="w-100" />
          </SwiperSlide>
        ))}
      </Swiper>
    </>
  );
};

export default ThumbsGalleryExample;
