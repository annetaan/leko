// Something else in the project called Leko, with a method called reached.
// Nothing here is a signal, and a scan that matches on names would say it is.
class Leko {
  reached(_name: string): void {}
}

export const queue = new Leko()
queue.reached('not-a-signal')
