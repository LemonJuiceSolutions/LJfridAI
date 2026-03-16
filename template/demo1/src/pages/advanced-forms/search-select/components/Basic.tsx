import React, { useState } from 'react';
import Select from 'react-select';

interface CountryOption {
  value: string;
  label: string;
}

// Sample data for options
const countryOptions: CountryOption[] = [
  { value: 'us', label: 'United States' },
  { value: 'ca', label: 'Canada' },
  { value: 'uk', label: 'United Kingdom' },
  { value: 'de', label: 'Germany' },
  { value: 'fr', label: 'France' },
  { value: 'jp', label: 'Japan' },
  { value: 'au', label: 'Australia' },
  { value: 'br', label: 'Brazil' },
  { value: 'in', label: 'India' },
  { value: 'cn', label: 'China' },
];

const BasicExample = () => {
  const [selectedCountry, setSelectedCountry] = useState<CountryOption | null>(null);

  return (
    <Select
      options={countryOptions}
      value={selectedCountry}
      onChange={(option) => setSelectedCountry(option)}
      placeholder="Choose a country..."
      isClearable
      isSearchable
      className="react-select-container"
      classNamePrefix="react-select"
    />
  );
};

export default React.memo(BasicExample);
