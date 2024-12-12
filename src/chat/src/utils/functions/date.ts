export function formatDate(dateString: string, format: string): string {
  const date = new Date(dateString)
  const year = date.getFullYear()
  const month = (`0${date.getMonth() + 1}`).slice(-2)
  const day = (`0${date.getDate()}`).slice(-2)

  format = format.replace('yyyy', year.toString())
  format = format.replace('MM', month)
  format = format.replace('dd', day)

  return format
}
