import React from 'react';
import Select from 'react-select';

interface ColourOption {
  value: string;
  label: string;
  color: string;
  isFixed?: boolean;
  isDisabled?: boolean;
}

// Sample data for options
const colourOptions: ColourOption[] = [
  { value: 'ocean', label: 'Ocean', color: '#00B8D9', isFixed: true },
  { value: 'blue', label: 'Blue', color: '#0052CC', isDisabled: true },
  { value: 'purple', label: 'Purple', color: '#5243AA' },
  { value: 'red', label: 'Red', color: '#FF5630', isFixed: true },
  { value: 'orange', label: 'Orange', color: '#FF8B00' },
  { value: 'yellow', label: 'Yellow', color: '#FFC400' },
  { value: 'green', label: 'Green', color: '#36B37E' },
  { value: 'forest', label: 'Forest', color: '#00875A' },
  { value: 'slate', label: 'Slate', color: '#253858' },
  { value: 'silver', label: 'Silver', color: '#666666' },
];

interface FlavourOption {
  value: string;
  label: string;
  rating: string;
}

const flavourOptions: FlavourOption[] = [
  { value: 'vanilla', label: 'Vanilla', rating: 'safe' },
  { value: 'chocolate', label: 'Chocolate', rating: 'good' },
  { value: 'strawberry', label: 'Strawberry', rating: 'wild' },
  { value: 'salted-caramel', label: 'Salted Caramel', rating: 'crazy' },
];

interface GroupedOption {
  label: string;
  options: ColourOption[] | FlavourOption[];
}

const groupedOptions: GroupedOption[] = [
  {
    label: 'Colours',
    options: colourOptions,
  },
  {
    label: 'Flavours',
    options: flavourOptions,
  },
];

const formatGroupLabel = (data: GroupedOption) => (
  <div className="d-flex align-items-center justify-content-between text-secondary text-opacity-75">
    <span className="me-2 fs-11px">{data.label || ''}</span>
    <span className="fs-11px">({data.options.length})</span>
  </div>
);

const GroupedExample = () => {
  return (
    <Select<ColourOption | FlavourOption, false, GroupedOption>
      defaultValue={colourOptions[3]}
      options={groupedOptions}
      formatGroupLabel={formatGroupLabel}
      className="react-select-container"
      classNamePrefix="react-select"
    />
  );
};

export default React.memo(GroupedExample);
