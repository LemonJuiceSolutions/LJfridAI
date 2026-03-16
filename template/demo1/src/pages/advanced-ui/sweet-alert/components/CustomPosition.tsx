import { Button } from 'react-bootstrap';
import Swal from 'sweetalert2';
import withReactContent from 'sweetalert2-react-content';

const MySwal = withReactContent(Swal);

const CustomPositionExample = () => {
  const showAlert = () => {
    MySwal.fire({
      position: 'top',
      title: 'Your work has been saved',
      customClass: {
        title: 'fs-4 mb-2',
      },
      showConfirmButton: false,
      timer: 1500,
      icon: 'success',
    });
  };

  return (
    <Button variant="primary" onClick={showAlert}>
      Show SweetAlert
    </Button>
  );
};

export default CustomPositionExample;
