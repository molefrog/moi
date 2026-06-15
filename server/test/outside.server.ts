// Lives OUTSIDE __fixtures__ on purpose: the worker containment test points
// MEI_FUNCTIONS_DIR at __fixtures__ and asserts that module key "../outside"
// is rejected even though this file exists.
export async function leak() {
  return 'should never load'
}
