import React from 'react';
import Creatable from 'react-select/creatable';

interface CountryOption {
  value: string;
  label: string;
}

// Sample data for options
const countryOptions: CountryOption[] = [
  { value: 'ca', label: 'Canada' },
  { value: 'in', label: 'India' },
  { value: 'cn', label: 'China' },
];

const CreatableExample = () => {
  return (
    <Creatable
      options={countryOptions}
      isClearable
      isMulti
      placeholder="Choose a country..."
      className="react-select-container"
      classNamePrefix="react-select"
    />
  );
};

export default React.memo(CreatableExample);
