import { Swiper, SwiperSlide } from 'swiper/react';
import { EffectCards } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/effect-cards';
import { getUrl } from '@/utils/getUrl';
import { IMAGES } from './images';

const EffectCardsExample = () => {
  return (
    <>
      <Swiper effect={'cards'} grabCursor={true} modules={[EffectCards]} className="effect-cards-swiper">
        {IMAGES.map((image) => (
          <SwiperSlide key={image.id}>
            <div className="image-card">
              <img src={getUrl(image.src)} alt={image.alt} title={image.title} />
            </div>
          </SwiperSlide>
        ))}
      </Swiper>
    </>
  );
};

export default EffectCardsExample;
