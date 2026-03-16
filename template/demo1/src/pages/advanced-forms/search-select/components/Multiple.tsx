import React from 'react';
import Select, { components, MultiValueProps, OptionProps } from 'react-select';

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

const { Option, MultiValue } = components;

// Custom option component for countries with flags
const CountryOption = (props: OptionProps<CountryOption>) => (
  <Option {...props}>
    <span className="me-2 fs-16px">{props.data.flag}</span>
    {props.data.label}
  </Option>
);

// Custom value component for countries with flags
const CountryValue = (props: MultiValueProps<CountryOption, true>) => (
  <MultiValue {...props}>
    <span className="me-2 fs-16px">{props.data.flag}</span>
    {props.data.label}
  </MultiValue>
);

const MultipleExample = () => {
  return (
    <Select
      defaultValue={[countryOptions[3], countryOptions[4]]}
      options={countryOptions}
      components={{
        Option: CountryOption,
        MultiValue: CountryValue,
      }}
      placeholder="Choose countries..."
      isMulti
      closeMenuOnSelect={false}
      className="react-select-container"
      classNamePrefix="react-select"
    />
  );
};

export default React.memo(MultipleExample);
