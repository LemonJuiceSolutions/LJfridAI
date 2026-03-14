import { Heart } from 'lucide-react';

const Footer = () => {
  return (
    <footer className="footer d-flex align-items-center justify-content-between px-3 px-md-4 py-3 border-top small">
      <p className="text-secondary">
        Copyright © {new Date().getFullYear()}{' '}
        <a href="https://www.nobleui.com" target="_blank" rel="noopener noreferrer">
          NobleUI
        </a>
        .
      </p>
      <p className="text-secondary">
        Handcrafted With <Heart size={14} className="text-danger ms-1" />
      </p>
    </footer>
  );
};

export default Footer;
