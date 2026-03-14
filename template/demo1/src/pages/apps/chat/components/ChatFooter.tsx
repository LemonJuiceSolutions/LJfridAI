import { ChangeEvent, KeyboardEvent, useState } from 'react';
import { Mic, Paperclip, Send, Smile } from 'lucide-react';
import { Button, Form } from 'react-bootstrap';

interface ChatFooterProps {
  onSend: (text: string) => void;
}

const ChatFooter = ({ onSend }: ChatFooterProps) => {
  const [input, setInput] = useState('');

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  };

  const handleSend = () => {
    if (input.trim()) {
      onSend(input);
      setInput('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="chat-footer d-flex">
      <div>
        <Button type="button" className="border bg-transparent btn-icon rounded-circle me-2" title="Emoji">
          <Smile className="text-secondary" />
        </Button>
      </div>
      <div className="d-none d-md-block">
        <Button type="button" className="border bg-transparent btn-icon rounded-circle me-2" title="Attach files">
          <Paperclip className="text-secondary" />
        </Button>
      </div>
      <div className="d-none d-md-block">
        <Button type="button" className="border bg-transparent btn-icon rounded-circle me-2" title="Record you voice">
          <Mic className="text-secondary" />
        </Button>
      </div>
      <Form
        className="flex-grow-1 me-2"
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
      >
        <Form.Control
          type="text"
          className="rounded-pill"
          id="chatForm"
          placeholder="Type a message"
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
        />
      </Form>
      <div>
        <Button variant="primary" type="button" className="btn-icon rounded-circle" onClick={handleSend}>
          <Send />
        </Button>
      </div>
    </div>
  );
};

export default ChatFooter;
