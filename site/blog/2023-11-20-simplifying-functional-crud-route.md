---
slug: simplify-fp-crud
title: Simplifying a functional crud route
---

Most larger applications eventually solve three problems:
1. Raising errors that need to be handled.
2. Handling lists of data as opposed to single entities.
3. Optionally calling apis, depending on input.

To exemplify what issues may arrise when dealing with such problems, we will create an entity by performing some operations for each input:
1. Parse the input ([as opposed to validating](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/)).
2. Read relevant data from a database, raising an error if the data is not found.
3. Construct the resulting entity, by calling a remote api.
4. Insert the data to the database.

## Motivation
When using by-the-book functional programming tools to perform the tasks at hand the code quickly grows unwieldy.
By applying more exotic functional abstractions, we can simplify the code and make it more extensible.

## Domain
To exemplify the problem, we will go though adding a feature for creating users.
We will use some simple domain types to represent our problem.
```scala
final case class InputUser(
  name: String,
  age: Int,
  phone: String,
  shouldBeCreatedInApi: Boolean
)

final case class Organization(
  id: UUID,
  name: String
)

final case class Phone(value: String) extends AnyVal
def parsePhone(phone: String): Either[String, Phone] = ???

final case class User(
  id: UUID,
  name: String,
  age: Int,
  phone: Phone,
  api: Option[Int],
  organization: UUID
)

final case class CreateUser(name: String, phone: Phone)
trait UserApi {
  // returns the ids of the created users
  def createUsers(token: String, inputs: NonEmptyList[CreateUser]): IO[NonEmptyList[Int]]
}

trait Repo {
  def insertUser(user: NonEmptyList[User]): IO[Unit]
  def getOrganization(id: String): IO[Option[Organization]]
  def getOrganizationAccessToken(id: String): IO[String]
}
```

## The initial implementation
We'll start off with a crude and complex implementation to set the stage.
```scala
sealed trait Error
final case class PhoneParseError(message: String) extends Throwable with Error {
  override def getMessage: String = message
}

final case class OrganizationNotFound() extends Throwable with Error {
  override def getMessage: String = s"Organization not found"
}

def insertUser(
  organizationId: String,
  inputs: NonEmptyList[InputUser],
  api: UserApi,
  repo: Repo
): IO[Either[Error, NonEmptyList[UUID]]] = {
  val run: IO[NonEmptyList[UUID]] = 
    for {
      withPhone <- input.traverse{ iu =>
        IO.fromEither(parsePhone(iu.phone).leftMap(PhoneParseError(_))).map(x => (iu, x))
      }
      _ <- repo.getOrganization(organizationId).flatMap{
        case None => IO.raiseError(OrganizationNotFound())
        case Some(_) => IO.unit
      }

      usersThatNeedToBeCreated = withPhone.filter{ case (iu, _) => iu.shouldBeCreatedInApi }

      withApiIds <- usersThatNeedToBeCreated
        .toNel
        .toList
        .flatTraverse { nel =>
          repo.getOrganizationAccessToken(organizationId).flatMap{ token =>
            val creates = nel.map{ case (iu, phone) => CreateUser(iu.name, phone) }
            api.createUsers(token, creates).map(_.zip(nel))
          }
        }

      createdUsers = withApiIds.map{ case (apiId, (iu, phone)) => (iu, phone, Some(apiId)) }
      nonCreatedUsers = withSecrets
        .collect{ case (iu, phone) if !(iu.shouldBeCreatedInApi) => (iu, phone, Option.empty[Int]) }

      users <- (createdUsers ++ nonCreatedUsers).traverse { case (iu, phone, apiId) =>
        UUIDGen.randomUUID[IO].map(id => User(id, iu.name, iu.age, phone, apiId, organizationId))
      }
      _ <- users.toNel.traverse_(xs => repo.insertUser(xs))
    } yield users.map(_.id)

  run.map(Right(_)).recover{ case e: Error => Left(e) }
}
```
The initial implementation has some issues, some of which are syntatic and others semantic.
1. (syntax) We pay a steep price in terms of complexity for batching api operations.
2. (semantics) Errors are not accumulated, the first error that occurs "wins".
3. (syntax) If more steps are added then the tuple of data we pass around will grow.
4. (semantics) Any intermediate exception handlers may eat our error since it is a exception.
5. (syntax) Partitioning the inputs into two groups is not a pleasant experience and scales poorly with more groups.

### Functional error handling
The classic answer to error handling when effects are involved in functional programming is monad transformers.
Although this won't be our final destination, adding a monad transformer as an intermediate stepping stone in our refactoring will help us understand the problem better.
```scala
def insertUser(
  organizationId: String,
  inputs: NonEmptyList[InputUser],
  api: UserApi,
  repo: Repo
): IO[Either[Error, NonEmptyList[UUID]]] = {
  type G[A] = EitherT[IO, Error, A]
  val G = MonadError[G, Error]
  val liftK: IO ~> G = EitherT.liftK[IO, Error]
  val run: G[NonEmptyList[UUID]] = 
    for {
      withPhone <- input.traverse{ iu =>
        G.fromEither(parsePhone(iu.phone).leftMap(PhoneParseError(_))).map(x => (iu, x))
      }
      _ <- liftK(repo.getOrganization(organizationId)).flatMap{
        case None => G.raiseError(OrganizationNotFound())
        case Some(_) => G.unit
      }

      usersThatNeedToBeCreated = withPhone.filter{ case (iu, _) => iu.shouldBeCreatedInApi }

      withApiIds <- liftK {
        usersThatNeedToBeCreated
          .toNel
          .toList
          .flatTraverse { nel =>
            repo.getOrganizationAccessToken(organizationId).flatMap{ token =>
              val creates = nel.map{ case (iu, phone) => CreateUser(iu.name, phone) }
              api.createUsers(token, creates).map(_.zip(nel))
            }
          }
      }

      createdUsers = withApiIds.map{ case (apiId, (iu, phone)) => (iu, phone, Some(apiId)) }
      nonCreatedUsers = withSecrets
        .collect{ case (iu, phone) if !(iu.shouldBeCreatedInApi) => (iu, phone, Option.empty[Int]) }

      users <- liftK {
        (createdUsers ++ nonCreatedUsers).traverse { case (iu, phone, apiId) =>
          UUIDGen.randomUUID[IO].map(id => User(id, iu.name, iu.age, phone, apiId, organizationId))
        }
      }
      _ <- liftK(users.toNel.traverse_(xs => repo.insertUser(xs)))
    } yield users.map(_.id)

  run.run
}
```
With the addition of `EitherT` we have alleviated the 4th concern, but with the unfortunate side effect of making the code more complex.
Before handling `EitherT`, let's take a look at another issue.
### Accumulating errors
Monads are inherently sequential, and as such, they are not well suited for accumulating errors.
Instead, we are looking for an algebraic structure that allows independent operations to be combined.
To solve this riddle, we'll invite `Applicative` to the war table.
`Either` has an accumulating cousin called `Validated` that forms an `Applicative` if the error `E` forms a `Semigroup`.
`cats` gives some useful type aliases for `Validated`.
Notably, `ValidatedNec` that has the following definition:
```scala
type ValidatedNec[E, A] = Validated[NonEmptyChain[E], A]
```
Since `NonEmptyChain` forms a `Semigroup` (it has a lawful combine function), then we have our `Applicative`.

Writing out the code (or reading it for that matter) with `Validated` is not going to be a pleasant experience.
It will involve a bunch of values of type `IO[ValidatedNec[Error, A]]` which all require a bunch of `sequence`ing to wire together.
Instead, bear with me, we can intorduce another typeclass that will help us out.

`cats` distills the relationship for structures that have `Applicative` or `Monad` semantics into a typeclass `Parallel`.

`Parallel` for structures `F` and `G` implies that we know:
* `F ~> G`
* `G ~> F`
* `Applicative[G]`
* `Monad[F]`

`Parallel` does not neccessarily mean parallel execution, but rather the ability to switch to a different context for intermediate operations.
`Parallel` defines the realtionship between `Either` and `Validated` for some type `E` iff `E` forms a `Semigroup`:
* `Either[E, *] ~> Validated[E, *]` by `toValidated`
* `Validated[E, *] ~> Either[E, *]` by `toEither`
* `Applicative[Validated[E, *]]` since `E` forms a `Semigroup`
* `Monad[Either[E, *]]` by construction

Now for the application of all this theory.
Our `EitherT` also has a `Parallel` instance that allows us to accumulate errors.
We'll use `parTraverse` instead of `traverse` when parsing the phone numbers.
```scala
type Errors = NonEmptyChain[Error]
def insertUser(
  organizationId: String,
  inputs: NonEmptyList[InputUser],
  api: UserApi,
  repo: Repo
): IO[Either[Errors, NonEmptyList[UUID]]] = {
  type G[A] = EitherT[IO, Errors, A]
  val G = MonadError[G, Errors]
  val liftK: IO ~> G = EitherT.liftK[IO, Errors]
  implicit val parallelG: Parallel[G] = EitherT.accumulatingParallel[IO, Errors]
  val run: G[NonEmptyList[UUID]] = 
    for {
      withPhone <- input.parTraverse{ iu =>
        G.fromEither {
          parsePhone(iu.phone).leftMap(x => NonEmptyChain.one(PhoneParseError(x)))
        }.map(x => (iu, x))
      }
      _ <- liftK(repo.getOrganization(organizationId)).flatMap{
        case None => G.raiseError(NonEmptyChain.one(OrganizationNotFound()))
        case Some(_) => G.unit
      }

      usersThatNeedToBeCreated = withPhone.filter{ case (iu, _) => iu.shouldBeCreatedInApi }

      withApiIds <- liftK {
        usersThatNeedToBeCreated
          .toNel
          .toList
          .flatTraverse { nel =>
            repo.getOrganizationAccessToken(organizationId).flatMap{ token =>
              val creates = nel.map{ case (iu, phone) => CreateUser(iu.name, phone) }
              api.createUsers(token, creates).map(_.zip(nel))
            }
          }
      }

      createdUsers = withApiIds.map{ case (apiId, (iu, phone)) => (iu, phone, Some(apiId)) }
      nonCreatedUsers = withSecrets
        .collect{ case (iu, phone) if !(iu.shouldBeCreatedInApi) => (iu, phone, Option.empty[Int]) }

      users <- liftK {
        (createdUsers ++ nonCreatedUsers).traverse { case (iu, phone, apiId) =>
          UUIDGen.randomUUID[IO].map(id => User(id, iu.name, iu.age, phone, apiId, organizationId))
        }
      }
      _ <- liftK(users.toNel.traverse_(xs => repo.insertUser(xs)))
    } yield users.map(_.id)

  run.run
}
```
This solves issue 2.
There is a lot of considerations behind our parallel instance.
A `Parallel` inastance for `EitherT` is not a free lunch, it comes with ambiguity.
Multiple valid `Parallel` instances for `EitherT` exist, but that is another topic.

### Handling batching
We pay a hefty price for batching, since we have to manually partition our batches and handle the case where there are no elements in the batch.

Say we would like to solve our batching issue once and for all.
By exploring commonplace batching libraries, one would quickly find that most use global state and timers.
Solving problems algebraically as opposed to heuristically, is something functional programmers should be good at.
[Haxl](https://dl.acm.org/doi/10.1145/2628136.2628144) is an optimistic algebraic solution for batching that works out most applications.

Haxl is a library for Haskell, but implementations for Scala also exist.
* [Fetch](https://github.com/xebia-functional/fetch) is a library that is close to Haxl and has a plentyful collection of utilities.
* [Hxl](https://github.com/casehubdk/hxl) is a small (pure) library that focuses on the core of Haxl and extensibility whilst being algebraically correct.
* [ZQuery](https://github.com/zio/zio-query) is a library that that also provides a Haxl-like experience, being it is built on top of `ZIO`, it is not as typeclass focused but instead leans heavily into `ZIO`.
Since this article is about simplifying and using sound algebraic principles, we will be using `Hxl`.

To allow batching we must lift our batched api's into `Hxl`.
As in the Haxl paper, we must define datasources for our api's.
```scala
final case class InsertUserKey(user: User)
case object InsertUser extends DSKey[InsertUserKey, Unit]

def insertUserDataSource(repo: Repo): DataSource[IO, InsertUserKey, Unit] = 
  DataSource.void(InsertUser) { (keys: NonEmptyList[InsertUserKey]) =>
    repo.insertUser(keys.map(_.user)).void
  }

def insertUser(user: User, repo: Repo): Hxl[IO, Unit] =
  Hxl(InsertUserKey(user), insertUserDataSource(repo)).void

final case class CreateUsersKey(users: CreateUser)
object CreateUsersKey {
  implicit val show: Show[CreateUsersKey] = Show.fromToString
}
final case class CreateUsers(token: String) extends DSKey[CreateUsersKey, Int]

def createUserDataSource(token: String, api: UserApi): DataSource[IO, CreateUsersKey, Int] = 
  DataSource.lift(InsertUser(token)) { (keys: NonEmptyList[CreateUsersKey]) =>
    api.createUsers(token, keys.map(_.users)).map{ results =>
      keys.zip(results).toList.toMap: Map[CreateUsersKey, Int]
    }
  }

def createUser(input: CreateUser, token: String, api: UserApi): Hxl[IO, Int] =
  Hxl.force(CreateUsersKey(input), createUserDataSource(token, api))
```

`Hxl` forms only an `Applicative`, but we need `flatMap` to express our program.
`Hxl` provides `andThen` (like `Validated`) and a `Monad`ic view `HxlM`, like `Either` is to `Validated`.

Before the next iteration, note that we only need to load the token if we have at least one user that needs to be created in the api.
We can use `Hxl` to load the token exactly once.
But not all tasks need to be solved with the same tool, if a simpler one is available.
We can look towards memoization to lazily load the token.

Hxl, by default, does only provide an `Applicative` instance.
However, we can import a `Parallel` instance for `Hxl` which will let us combine the resulting `Hxl`s in parallel if our effect type also forms a `Parallel`.

:::info
`Hxl`s `Parallel` instance has a `Monad` inside of it, so it can be unsafe to use if you pull the `Monad` out.
Therefore it is behind an import.
:::

Now we can express our batching a tad more elegantly.
```scala
def insertUser(
  organizationId: String,
  inputs: NonEmptyList[InputUser],
  api: UserApi,
  repo: Repo
): IO[Either[Errors, NonEmptyList[UUID]]] = {
  type G[A] = EitherT[IO, Errors, A]
  val G = MonadError[G, Errors]
  val liftK: IO ~> G = EitherT.liftK[IO, Errors]
  implicit val parallelG: Parallel[G] = EitherT.accumulatingParallel[IO, Errors]
  import hxl.instances.parallel._
  def run(input: InputUser, getToken: IO[String]): Hxl[G, UUID] = 
    for {
      phone <- HxlM.liftF {
        G.fromEither(parsePhone(iu.phone).leftMap(x => NonEmptyChain.one(PhoneParseError(x))))
      }
      apiId <- 
        if (input.shouldBeCreatedInApi)
          Hxl.liftF(getToken)
            .flatMap(token => createUser(input, token, api)).mapK(liftK)
            .monadic.map(Some(_))
        else HxlM.pure[G, Option[Int]](None)
      id <- HxlM.liftF(liftK(UUIDGen.randomUUID[IO]))
      u = User(id, input.name, input.age, phone, apiId, organizationId)
      _ <- insertUser(u, repo).mapK(liftK).monadic
    } yield id

  for {
    _ <- liftK(repo.getOrganization(organizationId)).flatMap{
      case None => G.raiseError(NonEmptyChain.one(OrganizationNotFound()))
      case Some(_) => G.unit
    }
    getToken <- liftK(repo.getOrganizationAccessToken(organizationId).memoize)
    // notice we run in parallel to use our accumulating parallel instance
    res <- Hxl.runSequential(inputs.parTraverse(iu => run(iu, getToken)).hxl)
  } yield res
}
```
Yeah, that's a lot shorter.
We solved issue 1 and 5 with `Hxl`.

### Erasing `EitherT`
A lot of the code's remaining complexity is due to our use of `EitherT`.
Pulling in a tool to algebraically solve a problem will yet again be our salvation.

A capability based utility named [catch-effect](https://github.com/ValdemarGr/catch-effect) that I have authored will aid us in this task.
`catch-effect` allows us to write as if using MTL, but without the need for monad transformers.
`catch-effect` provides a structure `Catch` that can open local scopes where errors can be raised and caught:
```scala
def example(c: Catch[IO]): IO[Either[Error, String]] =
  c.use[Error] { (h: Handle[IO]) =>
    h.raiseError(PhoneParseError("error")) *> IO("I will never happen")
  }
```

Let us take a step back and relax our accumulating errors constraint for the next iteration.
```scala
def insertUser(
  organizationId: String,
  inputs: NonEmptyList[InputUser],
  api: UserApi,
  repo: Repo,
  c: Catch[IO]
): IO[Either[Error, NonEmptyList[UUID]]] = c.use[Error] { h =>
  def run(input: InputUser, getToken: IO[String]): Hxl[IO, UUID] = 
    for {
      phone <- HxlM.liftF {
        h.fromEither(parsePhone(iu.phone).leftMap(x => PhoneParseError(x)))
      }
      apiId <- 
        if (input.shouldBeCreatedInApi)
          Hxl.liftF(getToken)
            .flatMap(token => createUser(input, token, api))
            .monadic.map(Some(_))
        else HxlM.pure[IO, Option[Int]](None)
      id <- HxlM.liftF(UUIDGen.randomUUID[IO])
      u = User(id, input.name, input.age, phone, apiId, organizationId)
      _ <- insertUser(u, repo).monadic
    } yield id

  for {
    _ <- h.fromOptionF(OrganizationNotFound())(repo.getOrganization(organizationId))
    getToken <- repo.getOrganizationAccessToken(organizationId).memoize
    res <- Hxl.runSequential(inputs.traverse(iu => run(iu, getToken)).hxl)
  } yield res
}
```

Now let's restore our wish for accumulating errors.

When we worked with `EitherT`, we had to pick a `Parallel` instance for `EitherT` that would accumulate errors.
The default `Parallel` instance for `IO` will for any two effects, run their effects as two parallel (green) threads.
`IO`, however, connet reason with errors from `catch-effect`.
Fortunately `catch-effect` can form a `Parallel` accumulating instance for `IO` (given thate `E` forms a `Semigroup`), just like `EitherT`!.
When we slam all of our `Hxl`s together, we will do so in parallel, using the enchanced `Parallel` instance from `catch-effect`.
```scala
def insertUser(
  organizationId: String,
  inputs: NonEmptyList[InputUser],
  api: UserApi,
  repo: Repo,
  c: Catch[IO]
): IO[Either[Errors, NonEmptyList[UUID]]] = c.use[Errors] { h =>
  implicit val parallelIO: Parallel[IO] = c.accumulatingParallel
  
  def run(input: InputUser, getToken: IO[String]): Hxl[IO, UUID] = 
    for {
      phone <- HxlM.liftF {
        h.fromEither(parsePhone(iu.phone).leftMap(x => NonEmptyChain.one(PhoneParseError(x))))
      }
      apiId <- 
        if (input.shouldBeCreatedInApi)
          Hxl.liftF(getToken)
            .flatMap(token => createUser(input, token, api))
            .monadic.map(Some(_))
        else HxlM.pure[IO, Option[Int]](None)
      id <- HxlM.liftF(UUIDGen.randomUUID[IO])
      u = User(id, input.name, input.age, phone, apiId, organizationId)
      _ <- insertUser(u, repo).monadic
    } yield id

  for {
    _ <- h.fromOptionF(NonEmptyChain.one(OrganizationNotFound())) { 
      repo.getOrganization(organizationId)
    }
    getToken <- repo.getOrganizationAccessToken(organizationId).memoize
    res <- Hxl.runSequential(inputs.parTraverse(iu => run(iu, getToken)).hxl)
  } yield res
}
```

And that's it.
We went though a lot of stuff, but we ended up with a much shorter solution.
The data sources we created can also be reused in other parts of our application.

#### Conclusion
The lines-of-code reduction was not negligible, but we had to add extra abstractions to get there.

The final solution requires more knowledge of the generic abstractions, and reduces the required problem-specific knowledge for readers of the code.
However the initial solution is easier for someone who is not familiar with the abstractions to understand.

If an abstraction has a foundational nature, is principled and practical, then I believe it is worth the effort to learn.

Our interest in the relationship between `Monad` and `Applicative` is of foundational nature, the interest in dependent and independent things.
`Parallel` shows us that a structure can be given multiple semantics, some of which form a `Monad` and some of which form an `Applicative`.
We have also seen that `Parallel` can give a structure more than just two semantical interpretations, notably embedding a parallel structure inside of another parallel structure (`EitherT`).

`Hxl` is a principled solution to batching, however it is more of an engineering solution than a mathematical construction.
However, `Hxl` almost cuts the problem size in half and is generally applicable.

`catch-effect` introduces algebras (MTL) that are well established in functional programming.
`catch-effect` is born from modern effect research of algebraic effects and capabilities.
However, `catch-effect` is the only abstraction that we have explored which cannot be graced with soundness, as no there is no capture checking system in Scala (yet).

Thank you for reading, I hope that at least some of the ideas and abstractions presented in this article were of interest.
