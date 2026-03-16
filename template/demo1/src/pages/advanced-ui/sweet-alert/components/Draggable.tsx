import { Button } from 'react-bootstrap';
import Swal from 'sweetalert2';
import withReactContent from 'sweetalert2-react-content';

const MySwal = withReactContent(Swal);

const DraggableExample = () => {
  const showAlert = () => {
    MySwal.fire({
      title: 'Drag me!',
      icon: 'success',
      draggable: true,
    });
  };

  return (
    <Button variant="primary" onClick={showAlert}>
      Show SweetAlert
    </Button>
  );
};

export default DraggableExample;
