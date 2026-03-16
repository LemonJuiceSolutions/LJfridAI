import React from 'react';
import AsyncSelect from 'react-select/async';

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
  { value: 'mx', label: 'Mexico' },
  { value: 'es', label: 'Spain' },
  { value: 'it', label: 'Italy' },
  { value: 'nl', label: 'Netherlands' },
  { value: 'se', label: 'Sweden' },
  { value: 'no', label: 'Norway' },
  { value: 'dk', label: 'Denmark' },
  { value: 'fi', label: 'Finland' },
  { value: 'ch', label: 'Switzerland' },
  { value: 'at', label: 'Austria' },
];

const AsyncExample = () => {
  // Simulate async API call with delay
  const loadOptions = async (inputValue: string): Promise<CountryOption[]> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        const filteredOptions = countryOptions.filter((option) =>
          option.label.toLowerCase().includes(inputValue.toLowerCase())
        );
        resolve(filteredOptions);
      }, 500); // Simulate 500ms API delay
    });
  };

  return (
    <AsyncSelect
      loadOptions={loadOptions}
      cacheOptions
      defaultOptions={countryOptions.slice(0, 3)} // Show first 3 options by default
      placeholder="Search for a country..."
      className="react-select-container"
      classNamePrefix="react-select"
    />
  );
};

export default React.memo(AsyncExample);
