import { Swiper, SwiperSlide } from 'swiper/react';
import { Pagination } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/pagination';
import { IMAGES } from './images';
import { getUrl } from '@/utils/getUrl';
const PaginationExample = () => {
  return (
    <>
      <Swiper initialSlide={2} pagination={true} modules={[Pagination]}>
        {IMAGES.map((image) => (
          <SwiperSlide key={image.id}>
            <img src={getUrl(image.src)} alt={image.alt} title={image.title} className="w-100" />
          </SwiperSlide>
        ))}
      </Swiper>
    </>
  );
};

export default PaginationExample;
