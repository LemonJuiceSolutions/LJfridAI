import { Button } from 'react-bootstrap';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import Swal from 'sweetalert2';
import withReactContent from 'sweetalert2-react-content';

const MySwal = withReactContent(Swal);

const CustomHtmlExample = () => {
  const showAlert = () => {
    MySwal.fire({
      title: '<strong>HTML <u>example</u></strong>',
      icon: 'info',
      html: '(You can use <b>bold text</b>, <a href="http://github.com" target="_blank" rel="noopener noreferrer">links</a> and other HTML tags)',
      showCloseButton: true,
      showCancelButton: true,
      focusConfirm: false,
      confirmButtonText: (
        <>
          <ThumbsUp /> Great!
        </>
      ),
      confirmButtonAriaLabel: 'Thumbs up, great!',
      cancelButtonText: (
        <>
          <ThumbsDown /> Bad!
        </>
      ),
      cancelButtonAriaLabel: 'Thumbs down, bad!',
    });
  };

  return (
    <Button variant="primary" onClick={showAlert}>
      Show SweetAlert
    </Button>
  );
};

export default CustomHtmlExample;
