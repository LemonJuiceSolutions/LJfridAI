import { useState } from 'react';
import { Card, Col, Row } from 'react-bootstrap';
import ChatSidebar from './components/ChatSidebar';
import ChatHeader from './components/ChatHeader';
import ChatMessages from './components/ChatMessages';
import ChatFooter from './components/ChatFooter';
import { getUrl } from '@/utils/getUrl';

interface MessageContent {
  text: string;
  timestamp?: string;
}

interface ChatMessage {
  id: number;
  sender: 'me' | 'friend';
  avatar: string;
  contents: MessageContent[];
  imageUrl?: string;
}

const initialMessages: ChatMessage[] = [
  {
    id: 1,
    sender: 'friend',
    avatar: getUrl('/images/faces/face.webp'),
    contents: [
      { text: 'Hey, quick question—do you prefer using CSS Grid or Flexbox for layouts?', timestamp: '8:12 PM' },
    ],
  },
  {
    id: 2,
    sender: 'me',
    avatar: getUrl('/images/faces/face.webp'),
    contents: [
      {
        text: "Depends on the layout. I usually go with Flexbox for 1D layouts, Grid for 2D. Grid's `auto-fit` + `minmax()` is a lifesaver.",
      },
      { text: 'How about you?', timestamp: '8:13 PM' },
    ],
  },
  {
    id: 3,
    sender: 'friend',
    avatar: getUrl('/images/faces/face.webp'),
    contents: [
      { text: 'Same here. But sometimes I struggle with aligning items vertically in Flexbox.', timestamp: '8:15 PM' },
    ],
  },
  {
    id: 4,
    sender: 'me',
    avatar: getUrl('/images/faces/face.webp'),
    contents: [
      {
        text: 'Yeah, that gets tricky. Just make sure the container has a height, then use `align-items: center` or `margin: auto` on the child.',
        timestamp: '8:16 PM',
      },
      { text: '[image]', timestamp: '8:16 PM' },
    ],
    imageUrl: getUrl('/images/photos/img.webp'),
  },
  {
    id: 5,
    sender: 'friend',
    avatar: getUrl('/images/faces/face.webp'),
    contents: [
      { text: 'Got it. Btw, do you usually write media queries manually or use a mixin?', timestamp: '8:17 PM' },
    ],
  },
  {
    id: 6,
    sender: 'me',
    avatar: getUrl('/images/faces/face.webp'),
    contents: [
      { text: 'I use SCSS mixins mostly. Keeps things clean and reusable. Want me to share one?' },
      { text: 'It supports breakpoints like `tablet`, `desktop` etc.', timestamp: '8:18 PM' },
    ],
  },
  {
    id: 7,
    sender: 'friend',
    avatar: getUrl('/images/faces/face.webp'),
    contents: [
      {
        text: 'Yes, please. That would help a lot. Been meaning to create a better responsive setup.',
        timestamp: '8:22 PM',
      },
    ],
  },
  {
    id: 8,
    sender: 'me',
    avatar: getUrl('/images/faces/face.webp'),
    contents: [
      { text: 'Alright, will paste it here in a sec. You can tweak the breakpoints as needed.', timestamp: '8:30 PM' },
    ],
  },
];

const ChatPage = () => {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);

  const handleSendMessage = (text: string) => {
    if (!text.trim()) return;
    const newMessage: ChatMessage = {
      id: messages.length + 1,
      sender: 'me',
      avatar: getUrl('/images/faces/face.webp'),
      contents: [{ text, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }],
    };
    setMessages([...messages, newMessage]);
  };

  return (
    <Row className="chat-wrapper">
      <Col md={12}>
        <Card>
          <Card.Body>
            <Row className="position-relative">
              <Col lg={4} className="chat-aside border-end-lg">
                <ChatSidebar />
              </Col>

              <Col lg={8} className="chat-content">
                <ChatHeader />
                <ChatMessages messages={messages} />
                <ChatFooter onSend={handleSendMessage} />
              </Col>
            </Row>
          </Card.Body>
        </Card>
      </Col>
    </Row>
  );
};

export default ChatPage;
