import React from 'react';
import Select from 'react-select';
import makeAnimated from 'react-select/animated';

interface CountryOption {
  value: string;
  label: string;
  flag: string;
}

// Sample data for options
const countryOptions: CountryOption[] = [
  { value: 'us', label: 'United States', flag: '🇺🇸' },
  { value: 'ca', label: 'Canada', flag: '🇨🇦' },
  { value: 'uk', label: 'United Kingdom', flag: '🇬🇧' },
  { value: 'de', label: 'Germany', flag: '🇩🇪' },
  { value: 'fr', label: 'France', flag: '🇫🇷' },
  { value: 'jp', label: 'Japan', flag: '🇯🇵' },
  { value: 'au', label: 'Australia', flag: '🇦🇺' },
  { value: 'br', label: 'Brazil', flag: '🇧🇷' },
  { value: 'in', label: 'India', flag: '🇮🇳' },
  { value: 'cn', label: 'China', flag: '🇨🇳' },
  { value: 'mx', label: 'Mexico', flag: '🇲🇽' },
  { value: 'ar', label: 'Argentina', flag: '🇦🇷' },
  { value: 'ch', label: 'Chile', flag: '🇨🇱' },
  { value: 'co', label: 'Colombia', flag: '🇨🇴' },
  { value: 'pe', label: 'Peru', flag: '🇵🇪' },
  { value: 've', label: 'Venezuela', flag: '🇻🇪' },
];

const AnimationExample = () => {
  const animatedComponents = makeAnimated();

  return (
    <Select
      defaultValue={[countryOptions[5], countryOptions[6]]}
      options={countryOptions}
      components={animatedComponents}
      placeholder="Choose countries..."
      isClearable
      isMulti
      className="react-select-container"
      classNamePrefix="react-select"
    />
  );
};

export default React.memo(AnimationExample);
