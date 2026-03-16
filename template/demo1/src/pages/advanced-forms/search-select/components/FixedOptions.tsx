import React, { useState } from 'react';
import Select from 'react-select';

interface CountryOption {
  value: string;
  label: string;
  isFixed?: boolean;
}

// Sample data for options with some fixed options
const countryOptions: CountryOption[] = [
  { value: 'us', label: 'United States', isFixed: true },
  { value: 'ca', label: 'Canada', isFixed: true },
  { value: 'uk', label: 'United Kingdom' },
  { value: 'de', label: 'Germany' },
  { value: 'fr', label: 'France' },
  { value: 'jp', label: 'Japan' },
  { value: 'au', label: 'Australia' },
  { value: 'br', label: 'Brazil' },
  { value: 'in', label: 'India' },
  { value: 'cn', label: 'China' },
];

const orderOptions = (values: readonly CountryOption[]) => {
  return values.filter((v) => v.isFixed).concat(values.filter((v) => !v.isFixed));
};

const FixedOptionsExample = () => {
  const [selectedCountries, setSelectedCountries] = useState<CountryOption[]>(
    orderOptions([countryOptions[0], countryOptions[1], countryOptions[5]])
  );

  const handleChange = (newValue: readonly CountryOption[] | null) => {
    // Ensure fixed options are always included
    const fixedOptions = countryOptions.filter((option) => option.isFixed);
    const nonFixedSelected = (newValue || []).filter((option: CountryOption) => !option.isFixed);
    setSelectedCountries([...fixedOptions, ...nonFixedSelected]);
  };

  return (
    <Select
      isMulti
      options={countryOptions}
      value={selectedCountries}
      onChange={handleChange}
      placeholder="Choose countries..."
      isClearable={false}
      className="react-select-container"
      classNamePrefix="react-select"
      closeMenuOnSelect={false}
      hideSelectedOptions={false}
      styles={{
        multiValue: (provided, state) => ({
          ...provided,
          fontWeight: state.data.isFixed ? 'bold' : '',
        }),
        multiValueRemove: (provided, state) => ({
          ...provided,
          display: state.data.isFixed ? 'none' : 'block',
        }),
      }}
    />
  );
};

export default React.memo(FixedOptionsExample);
