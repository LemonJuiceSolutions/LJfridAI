import { Button } from 'react-bootstrap';
import Swal from 'sweetalert2';
import withReactContent from 'sweetalert2-react-content';

const MySwal = withReactContent(Swal);

const TitleAndIconExample = () => {
  const showAlert = () => {
    MySwal.fire({
      title: '🎉 Welcome to SweetAlert2!',
      text: 'You just triggered a beautiful and customizable alert. Try integrating this in your next project!',
      icon: 'question',
      confirmButtonText: 'Close',
    });
  };

  return (
    <Button variant="primary" onClick={showAlert}>
      Show SweetAlert
    </Button>
  );
};

export default TitleAndIconExample;
