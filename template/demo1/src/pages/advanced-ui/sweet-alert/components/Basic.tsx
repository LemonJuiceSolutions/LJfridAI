import { Button } from 'react-bootstrap';
import Swal from 'sweetalert2';
import withReactContent from 'sweetalert2-react-content';

const MySwal = withReactContent(Swal);

const BasicExample = () => {
  const showAlert = () => {
    MySwal.fire('🎉 Welcome to SweetAlert2!');
  };

  return (
    <Button variant="primary" onClick={showAlert}>
      Show SweetAlert
    </Button>
  );
};

export default BasicExample;
