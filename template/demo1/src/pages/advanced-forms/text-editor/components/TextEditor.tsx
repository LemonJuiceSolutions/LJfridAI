import { useState } from 'react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

const TOOLBAR_OPTIONS = [
  ['bold', 'italic', 'underline', 'strike'],
  ['code-block'],
  [{ list: 'ordered' }, { list: 'bullet' }],
  [{ script: 'sub' }, { script: 'super' }],
  [{ indent: '-1' }, { indent: '+1' }],
  [{ header: [1, 2, 3, 4, 5, 6, false] }],
  [{ align: [] }],
  ['link', 'image', 'video'],
  ['clean'],
];

const INITIAL_CONTENT = `<h2>Welcome to <span style="color: rgb(132, 141, 255)">React Quill Example</span></h2>`;

const TextEditorExample = () => {
  const [value, setValue] = useState(INITIAL_CONTENT);

  // Extract plain text from HTML
  const getPlainText = (html: string) => {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
  };

  return (
    <>
      <ReactQuill
        theme="snow"
        value={value}
        onChange={setValue}
        readOnly={false}
        placeholder="Type something amazing..."
        modules={{
          toolbar: TOOLBAR_OPTIONS,
          clipboard: { matchVisual: false },
          history: { delay: 1000, maxStack: 100, userOnly: true },
        }}
      />
      <p className="text-end text-secondary mt-2">Character count: {getPlainText(value).length}</p>
      <div>
        <h6 className="mb-2">HTML Output:</h6>
        <pre>{value}</pre>
        <h6 className="mb-2 mt-4">Plain Text Output:</h6>
        <pre className="mb-0">{getPlainText(value)}</pre>
      </div>
    </>
  );
};

export default TextEditorExample;
